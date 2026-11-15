import { BufferBank, playBuffer, type Voice } from '../../audio/synth/voice';
import { renderPluck, type PluckProfile } from '../../audio/synth/pluck';
import { chordName, transposeChord, type Chord, type Progression, resolvePreset, PROGRESSION_PRESETS } from '../../music/chords';
import { GUITAR_TUNING, guitarShape, type Shape } from '../../music/guitarShapes';
import { pretty } from '../../music/theory';
import { chordPad } from '../../ui/components/ChordPad';
import { section, segmented, selectBox, stepper, field } from '../../ui/components/controls';
import { setCell, stepGrid } from '../../ui/components/StepGrid';
import { h } from '../../ui/dom';
import { ChordInstrument } from '../ChordInstrument';
import type { Draft, Host } from '../Instrument';
import { Fretboard } from '../shared/Fretboard';
import { guitarArt } from './art';
import { STRUM_PATTERNS, STRUM_SYMBOLS, strumGlyph } from './strumPatterns';

export interface GuitarSettings {
  capo: number;
  tone: 'acoustic' | 'drive';
}

export interface GuitarAutomation {
  progression: Progression;
  pattern: string;
  patternId: string;
}

/** Steel-string acoustic. Lower notes ring longer, like real strings. */
const ACOUSTIC: PluckProfile = {
  t60: (f) => Math.max(1.2, Math.min(6, 5.5 * Math.pow(110 / f, 0.45))),
  brightness: 0.82,
  pickPosition: 0.13,
  maxDuration: 5,
};

type Direction = 'down' | 'up';

export class GuitarInstrument extends ChordInstrument<GuitarAutomation, GuitarSettings> {
  readonly id = 'guitar';
  readonly name = 'Guitar';
  readonly color = '#ff3d9a';
  readonly blurb = 'Six strings, a capo and strumming patterns';
  readonly tuning = GUITAR_TUNING;

  private bank!: BufferBank;
  private input!: GainNode;
  private cleanGain!: GainNode;
  private driveGain!: GainNode;
  private voices: (Voice | null)[] = GUITAR_TUNING.map(() => null);
  /** Chord currently held by the fretting hand (live play). */
  private held: Chord | null = null;

  protected channelOptions() {
    return { pan: -0.28, reverb: 0.24 };
  }

  protected buildAudio(): void {
    const ctx = this.audio;
    this.bank = new BufferBank((midi, variant) => renderPluck(ctx, midi, ACOUSTIC, variant));
    this.input = ctx.createGain();

    // Body resonance EQ (shared by both tones)
    const body1 = ctx.createBiquadFilter();
    body1.type = 'peaking';
    body1.frequency.value = 105;
    body1.Q.value = 1.2;
    body1.gain.value = 4;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking';
    body2.frequency.value = 230;
    body2.Q.value = 1;
    body2.gain.value = 2.5;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 5000;
    air.gain.value = -2;
    body1.connect(body2).connect(air).connect(this.channel.input);

    this.cleanGain = ctx.createGain();
    this.input.connect(this.cleanGain).connect(body1);

    // Overdrive: pre-gain -> soft clipper -> cabinet low-pass
    this.driveGain = ctx.createGain();
    this.driveGain.gain.value = 0;
    const pre = ctx.createGain();
    pre.gain.value = 9;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) * 0.9;
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 3600;
    cab.Q.value = 0.9;
    const post = ctx.createGain();
    post.gain.value = 0.32;
    this.input.connect(this.driveGain).connect(pre).connect(shaper).connect(cab).connect(post).connect(body1);

    this.bank.warm(this.tuning.flatMap((open) => [0, 1, 2, 3, 5, 7].map((f) => open + f)));
  }

  protected applySettings(): void {
    const drive = this.settings.tone === 'drive';
    const t = this.now;
    this.cleanGain.gain.setTargetAtTime(drive ? 0 : 1, t, 0.02);
    this.driveGain.gain.setTargetAtTime(drive ? 1 : 0, t, 0.02);
  }

  defaultSettings(): GuitarSettings {
    return { capo: 0, tone: 'acoustic' };
  }

  defaultAutomation(): GuitarAutomation {
    return { progression: resolvePreset(PROGRESSION_PRESETS[0], { root: 0, mode: 'major' }), pattern: STRUM_PATTERNS[1].pattern, patternId: STRUM_PATTERNS[1].id };
  }

  roomArt(): string {
    return guitarArt;
  }

  // ------------------------------------------------------------ sound

  get capo(): number {
    return this.settings.capo;
  }

  /** Pluck one string. `fret` is relative to the capo. */
  playString(string: number, fret: number, time = this.now, velocity = 0.8, variant = 'normal'): void {
    const midi = this.tuning[string] + this.capo + fret;
    this.voices[string]?.stop(time, 0.025);
    this.voices[string] = playBuffer(this.audio, this.bank.get(midi, variant), this.input, time, velocity * 0.55);
    this.show(time, 'hit', { key: `s${string}`, string, fret: this.capo + fret, midi, velocity });
  }

  damp(string: number, time = this.now): void {
    this.voices[string]?.stop(time, 0.05);
    this.voices[string] = null;
  }

  shapeFor(chord: Chord | null): Shape {
    return chord ? guitarShape(chord) : this.tuning.map(() => 0);
  }

  /** Strings ring one after another like a real strum (down = low to high). */
  strum(dir: Direction, shape: Shape, time = this.now, velocity = 0.85, opts: { topOnly?: number; chokeAfter?: number } = {}): void {
    let order = shape.map((_, i) => i);
    if (opts.topOnly) order = order.slice(order.length - opts.topOnly);
    if (dir === 'up') order.reverse();
    const spread = dir === 'down' ? 0.012 : 0.009;
    let k = 0;
    for (const i of order) {
      const f = shape[i];
      if (f === null) continue;
      const v = velocity * (0.88 + Math.random() * 0.12) * (dir === 'up' ? 0.78 : 1);
      this.playString(i, f, time + k * spread + Math.random() * 0.002, v);
      k++;
    }
    if (opts.chokeAfter) shape.forEach((_, i) => this.damp(i, time + opts.chokeAfter!));
  }

  /** Muted percussive "chuck". */
  chuck(time = this.now): void {
    this.tuning.forEach((_, i) => this.playString(i, 2, time + i * 0.005, 0.5, 'muted'));
  }

  /** Change the held chord; strings that are muted in the new shape stop ringing. */
  setHeld(chord: Chord | null, time = this.now): void {
    this.held = chord;
    const shape = this.shapeFor(chord);
    shape.forEach((f, i) => f === null && this.damp(i, time));
    this.show(time, 'chord', { chord });
  }

  previewChord(chord: Chord): void {
    this.setHeld(chord);
    this.strum('down', this.shapeFor(chord));
  }

  silence(): void {
    this.tuning.forEach((_, i) => this.damp(i));
  }

  // ------------------------------------------------------------ loop

  scheduleStep(localStep: number, time: number, stepDur: number): void {
    const a = this.automation;
    const pos = this.loopChord(localStep);
    if (!pos) return;
    const shape = this.shapeFor(pos.chord);
    if (pos.stepInSlot === 0) this.setHeld(pos.chord, time);
    const pat = a.pattern || '-';
    const ch = pat[localStep % pat.length];
    const accent = localStep % 4 === 0 ? 1 : 0.8;
    const bassString = shape.findIndex((f) => f !== null);
    switch (ch) {
      case 'D':
        return this.strum('down', shape, time, 0.85 * accent);
      case 'U':
        return this.strum('up', shape, time, 0.62, { topOnly: 4 });
      case 's':
        return this.strum('down', shape, time, 0.8, { chokeAfter: stepDur * 0.9 });
      case 'x':
        return this.chuck(time);
      case 'B':
        if (bassString >= 0) this.playString(bassString, shape[bassString]!, time, 0.85);
        return;
      case 'A': {
        const alt = bassString <= 1 ? 2 : Math.min(5, bassString + 1);
        if (shape[alt] !== null) this.playString(alt, shape[alt]!, time, 0.75);
        return;
      }
      default: {
        const n = Number(ch);
        if (n >= 1 && n <= 6) {
          const string = 6 - n;
          if (shape[string] !== null) this.playString(string, shape[string]!, time, 0.7);
        }
      }
    }
  }

  // ------------------------------------------------------------ UI

  private soundsAs(chord: Chord): string | null {
    return this.capo ? `sounds ${pretty(chordName(transposeChord(chord, this.capo)))}` : null;
  }

  mountStage({ el, d }: Host): void {
    const board = new Fretboard({
      tuning: this.tuning,
      stringLabels: ['E', 'A', 'D', 'G', 'B', 'e'],
      frets: 15,
      color: this.color,
      spacing: 38,
      stringWidths: [3.6, 1.1],
      strumZone: true,
      getCapo: () => this.capo,
      onPluck: (string, fret) => this.playString(string, fret),
      onStrumString: (string, dir) => {
        const f = this.shapeFor(this.held)[string];
        if (f !== null) this.playString(string, f, this.now, dir === 'down' ? 0.85 : 0.7);
      },
      onStrumTap: () => this.strum('down', this.shapeFor(this.held)),
    });
    board.setShape(this.held ? this.shapeFor(this.held) : null);

    const chordLabel = h('div', { class: 'now-chord' });
    const showChord = (c: Chord | null) => {
      chordLabel.replaceChildren(h('span', { class: 'now-chord-name' }, c ? pretty(chordName(c)) : 'Open strings'));
      if (c && this.capo) chordLabel.append(h('span', { class: 'now-chord-sub' }, this.soundsAs(c)));
    };
    showChord(this.held);

    d.add(this.visual.on('hit', (e) => board.flash(e.string!, e.fret ?? null)));
    d.add(
      this.visual.on('chord', ({ chord }) => {
        board.setShape(chord ? this.shapeFor(chord) : null);
        showChord(chord);
      }),
    );
    d.add(
      this.ctx.store.events.on('change', ({ action }) => {
        if (action.type === 'setSettings' && action.id === this.id) {
          board.updateCapo();
          showChord(this.held);
        }
      }),
    );

    el.append(
      chordLabel,
      h('div', { class: 'stage-instrument' }, board.el),
      h(
        'p',
        { class: 'stage-help' },
        'Click frets to pick notes. Drag across the round area to strum. ',
        h('kbd', {}, '1'),
        '–',
        h('kbd', {}, '7'),
        ' chords, ',
        h('kbd', {}, '↓'),
        ' / ',
        h('kbd', {}, 'Space'),
        ' strum down, ',
        h('kbd', {}, '↑'),
        ' strum up.',
      ),
    );
  }

  mountPlayPanel({ el, d }: Host): void {
    const pad = chordPad({
      store: this.ctx.store,
      d,
      hotkeys: true,
      sub: (c) => this.soundsAs(c),
      onChord: (c) => this.previewChord(c),
    });
    pad.setActive(this.held);
    d.add(this.visual.on('chord', ({ chord }) => pad.setActive(chord)));

    const capoSub = h('span', { class: 'hint inline' });
    const updateCapoSub = () => (capoSub.textContent = this.capo ? `Shapes sound ${this.capo} semitone${this.capo > 1 ? 's' : ''} higher` : 'No capo');
    updateCapoSub();
    const capo = stepper(this.capo, 0, 12, (v) => {
      this.updateSettings({ capo: v });
      updateCapoSub();
      pad.refresh();
    }, (v) => (v === 0 ? 'Off' : `Fret ${v}`));

    el.append(
      section(
        'Capo',
        null,
        field('Position', capo),
        capoSub,
      ),
      section('Tone', null, segmented<GuitarSettings['tone']>([{ value: 'acoustic', label: 'Acoustic' }, { value: 'drive', label: 'Overdrive' }], this.settings.tone, (v) => this.updateSettings({ tone: v }))),
      section(
        'Strum',
        null,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onClick: () => this.strum('down', this.shapeFor(this.held)) }, '↓ Down'),
          h('button', { type: 'button', class: 'btn', onClick: () => this.strum('up', this.shapeFor(this.held), this.now, 0.7, { topOnly: 4 }) }, '↑ Up'),
          h('button', { type: 'button', class: 'btn', onClick: () => this.chuck() }, '✕ Mute'),
          h('button', { type: 'button', class: 'btn ghost', onClick: () => this.setHeld(null) }, 'Let go'),
        ),
      ),
      section('Chords', 'Shape names are what your hand plays. With a capo, the real pitch is shown underneath.', pad.el),
    );
  }

  mountAutoPanel(host: Host, draft: Draft<GuitarAutomation>): void {
    this.mountProgressionSection(host, draft);
    const { el, d } = host;
    let brush = 'D';

    const presetSel = selectBox(
      [...STRUM_PATTERNS.map((p) => ({ value: p.id, label: p.name })), { value: 'custom', label: 'Custom' }],
      draft.get().patternId,
      (id) => {
        const p = STRUM_PATTERNS.find((x) => x.id === id);
        if (p) draft.set({ ...draft.get(), pattern: p.pattern, patternId: p.id });
      },
    );

    const palette = h('div', { class: 'palette', role: 'radiogroup', 'aria-label': 'Brush' });
    const renderPalette = () => {
      palette.replaceChildren(
        ...STRUM_SYMBOLS.map((s) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              title: s.title,
              'aria-checked': String(s.ch === brush),
              onClick: () => {
                brush = s.ch;
                renderPalette();
              },
            },
            s.label,
          ),
        ),
      );
    };
    renderPalette();

    const grid = stepGrid({
      steps: 16,
      rows: [{ id: 'strum', label: 'Strum', cells: draft.get().pattern }],
      glyph: (ch) => strumGlyph(ch),
      onCell: (_row, i) => {
        const cur = draft.get().pattern.padEnd(16, '-');
        const next = setCell(cur, i, cur[i] === brush ? '-' : brush, 16);
        draft.set({ ...draft.get(), pattern: next, patternId: 'custom' });
      },
    });

    d.add(
      draft.onChange((a) => {
        grid.update([{ id: 'strum', label: 'Strum', cells: a.pattern }]);
        presetSel.value = a.patternId;
      }),
    );
    d.add(
      this.ctx.transport.events.on('step', ({ step }) => {
        const local = this.localStepFor(step);
        grid.setPlayhead(local === null ? null : local % 16);
      }),
    );

    el.append(
      section(
        'Strumming pattern',
        'One bar, split into 16 steps. Pick a symbol, then tap steps to paint it. Tap a step again to clear it.',
        field('Style', presetSel),
        palette,
        grid.el,
      ),
    );
  }

  onKey(e: KeyboardEvent, down: boolean): boolean {
    if (!down || e.repeat) return false;
    const chord = this.hotkeyChord(e);
    if (chord) {
      this.previewChord(chord);
      return true;
    }
    if (e.code === 'Space' || e.key === 'ArrowDown') {
      this.strum('down', this.shapeFor(this.held));
      return true;
    }
    if (e.key === 'ArrowUp') {
      this.strum('up', this.shapeFor(this.held), this.now, 0.7, { topOnly: 4 });
      return true;
    }
    return false;
  }
}
