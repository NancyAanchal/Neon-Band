import { BowedVoice } from '../../audio/synth/bowed';
import { renderPluck, type PluckProfile } from '../../audio/synth/pluck';
import { BufferBank, playBuffer } from '../../audio/synth/voice';
import { PROGRESSION_PRESETS, chordPcs, closeVoicing, nearestChordTone, resolvePreset, type Chord, type Progression } from '../../music/chords';
import { clamp, midiToFreq, noteName, pc, pretty, scaleStep } from '../../music/theory';
import { chordPad } from '../../ui/components/ChordPad';
import { field, section, segmented, selectBox, toggle } from '../../ui/components/controls';
import { h, s } from '../../ui/dom';
import { ChordInstrument } from '../ChordInstrument';
import type { Draft, Host } from '../Instrument';
import { KEY_LAYOUT } from '../shared/KeyboardView';
import { violinArt } from './art';
import { MELODY_RHYTHMS, VIOLIN_STYLES, seeded } from './violinStyles';

export interface ViolinSettings {
  articulation: 'arco' | 'pizz';
  /** Snap finger position to the nearest semitone (perfect intonation). */
  snap: boolean;
  vibrato: boolean;
}

export interface ViolinAutomation {
  progression: Progression;
  style: string;
  register: 'low' | 'high';
}

/** G3 D4 A4 E5 */
const STRINGS = [55, 62, 69, 76];
const STRING_NAMES = ['G', 'D', 'A', 'E'];
const SEMITONES = 16;
const REGISTER = { low: 67, high: 79 };

const PIZZ: PluckProfile = { t60: (f) => Math.max(0.25, 0.9 * Math.pow(440 / f, 0.5)), brightness: 0.55, pickPosition: 0.2, maxDuration: 1.4 };

export class ViolinInstrument extends ChordInstrument<ViolinAutomation, ViolinSettings> {
  readonly id = 'violin';
  readonly name = 'Violin';
  readonly color = '#3dffb4';
  readonly blurb = 'Fretless strings with bow or pizzicato';
  readonly defaultVolume = 0.62;

  private input!: GainNode;
  private pizzBank!: BufferBank;
  /** Live notes held by the mouse/keyboard, by id. */
  private live = new Map<string, BowedVoice>();
  private loopVoices = new Set<BowedVoice>();
  private melodyNote = REGISTER.low + 5;

  protected channelOptions() {
    return { pan: 0.38, reverb: 0.34 };
  }

  protected buildAudio(): void {
    this.input = this.audio.createGain();
    this.input.connect(this.channel.input);
    this.pizzBank = new BufferBank((midi) => renderPluck(this.audio, midi, PIZZ));
  }

  defaultSettings(): ViolinSettings {
    return { articulation: 'arco', snap: true, vibrato: true };
  }

  defaultAutomation(): ViolinAutomation {
    return { progression: resolvePreset(PROGRESSION_PRESETS[0], { root: 0, mode: 'major' }), style: 'pad', register: 'low' };
  }

  roomArt(): string {
    return violinArt;
  }

  // ------------------------------------------------------------ sound

  /** Bowed note held until `release`. Pass a fractional midi number for in-between pitches. */
  bow(midi: number, time = this.now, velocity = 0.7, attack?: number): BowedVoice {
    return new BowedVoice(this.audio, this.input, this.ctx.engine.noise, midiToFreq(midi), time, { velocity, vibrato: this.settings.vibrato, attack });
  }

  pluck(midi: number, time = this.now, velocity = 0.8): void {
    playBuffer(this.audio, this.pizzBank.get(Math.round(midi)), this.input, time, velocity * 0.9);
  }

  private stringFor(midi: number): number {
    for (let i = STRINGS.length - 1; i >= 0; i--) if (midi >= STRINGS[i]) return i;
    return 0;
  }

  /** Start a live note (mouse/keys). Returns nothing for pizzicato (it just plucks). */
  liveOn(id: string, midi: number, string = this.stringFor(midi)): void {
    this.liveOff(id);
    this.show(this.now, 'hit', { key: `s${string}`, string, midi });
    if (this.settings.articulation === 'pizz') return this.pluck(midi);
    this.live.set(id, this.bow(midi));
  }

  liveMove(id: string, midi: number, string: number): void {
    const v = this.live.get(id);
    if (!v) return;
    v.setFreq(midiToFreq(midi));
    this.show(this.now, 'hit', { key: `s${string}`, string, midi });
  }

  liveOff(id: string): void {
    this.live.get(id)?.release();
    this.live.delete(id);
  }

  previewChord(chord: Chord): void {
    const [a, b] = this.doubleStop(chord, REGISTER.low + 4);
    const t = this.now;
    if (this.settings.articulation === 'pizz') {
      this.pluck(b, t);
      this.pluck(a, t + 0.02);
    } else {
      [a, b].forEach((m) => this.bow(m, t, 0.6).release(t + 1.3, 0.35));
    }
    this.show(t, 'hit', { key: `s${this.stringFor(a)}`, string: this.stringFor(a), midi: a });
    this.show(t, 'chord', { chord });
  }

  /** Two chord tones a comfortable distance apart, top note near `target`. */
  private doubleStop(chord: Chord, target: number): [number, number] {
    const top = nearestChordTone(chord, target);
    let low = top - 3;
    const pcs = chordPcs(chord);
    while (!pcs.includes(pc(low)) && low > top - 10) low--;
    return [top, low];
  }

  silence(): void {
    this.loopVoices.forEach((v) => v.release());
    this.loopVoices.clear();
  }

  // ------------------------------------------------------------ loop

  private playLoopNote(midi: number, time: number, dur: number, vel: number, articulation: 'arco' | 'pizz' | 'short'): void {
    const string = this.stringFor(midi);
    this.show(time, 'hit', { key: `s${string}`, string, midi });
    if (articulation === 'pizz') return this.pluck(midi, time, vel);
    const v = this.bow(midi, time, vel, articulation === 'short' ? 0.02 : 0.09);
    v.release(time + dur, articulation === 'short' ? 0.06 : 0.25);
    this.loopVoices.add(v);
    setTimeout(() => this.loopVoices.delete(v), (time - this.now + dur + 1) * 1000);
  }

  scheduleStep(localStep: number, time: number, stepDur: number): void {
    const a = this.automation;
    const pos = this.loopChord(localStep);
    if (!pos) return;
    const base = REGISTER[a.register];
    if (localStep === 0) this.melodyNote = base + 5;
    if (pos.stepInSlot === 0) this.show(time, 'chord', { chord: pos.chord });
    const inBar = pos.stepInSlot % 16;
    const remaining = (pos.slotSteps - pos.stepInSlot) * stepDur;
    const key = this.ctx.store.state.key;

    switch (a.style) {
      case 'pad': {
        if (pos.stepInSlot !== 0) return;
        this.melodyNote = nearestChordTone(pos.chord, this.melodyNote);
        const [top, low] = this.doubleStop(pos.chord, this.melodyNote);
        this.playLoopNote(top, time, remaining - 0.04, 0.55, 'arco');
        this.playLoopNote(low, time + 0.01, remaining - 0.04, 0.45, 'arco');
        return;
      }
      case 'pulse': {
        if (pos.stepInSlot === 0) this.melodyNote = nearestChordTone(pos.chord, this.melodyNote);
        if (inBar % 2 === 0) this.playLoopNote(this.melodyNote, time, stepDur * 1.4, inBar % 4 === 0 ? 0.75 : 0.55, 'short');
        return;
      }
      case 'pizz': {
        if (inBar % 4 !== 0) return;
        const arp = closeVoicing(pos.chord, base + 2, 3);
        const seq = [...arp, arp[0] + 12];
        this.playLoopNote(seq[(inBar / 4) % seq.length], time, stepDur * 2, 0.8, 'pizz');
        return;
      }
      case 'counter': {
        if (inBar % 8 !== 0) return;
        const candidates = [this.melodyNote - 2, this.melodyNote - 1, this.melodyNote + 1, this.melodyNote + 2, this.melodyNote];
        const tones = candidates.map((m) => nearestChordTone(pos.chord, m));
        const rand = seeded(localStep * 31 + pos.index * 7)();
        this.melodyNote = clamp(tones[Math.floor(rand * tones.length)], base - 2, base + 12);
        this.playLoopNote(this.melodyNote, time, Math.min(8 * stepDur, remaining) - 0.03, 0.55, 'arco');
        return;
      }
      default: {
        // Lyrical melody: chord tones on strong beats, scale steps in between
        const barIndex = Math.floor(localStep / 16);
        const rand = seeded(barIndex * 977 + pos.index * 131 + pc(pos.chord.root));
        const rhythm = MELODY_RHYTHMS[Math.floor(rand() * MELODY_RHYTHMS.length)];
        const note = rhythm.find(([st]) => st === inBar);
        if (!note) return;
        const strong = inBar % 8 === 0;
        const r = seeded(localStep * 13 + pos.index)();
        let next: number;
        if (strong) next = nearestChordTone(pos.chord, this.melodyNote + Math.round((r - 0.5) * 6));
        else next = scaleStep(this.melodyNote, r < 0.5 ? -1 : r < 0.85 ? 1 : 2, key);
        this.melodyNote = clamp(next, base, base + 14);
        this.playLoopNote(this.melodyNote, time, Math.min(note[1] * stepDur, remaining) - 0.02, strong ? 0.65 : 0.55, 'arco');
      }
    }
  }

  // ------------------------------------------------------------ UI

  mountStage({ el, d }: Host): void {
    const W = 1000;
    const nutX = 70;
    const endX = 880;
    const top = 60;
    const gap = 54;
    const xOf = (semi: number) => nutX + (semi / SEMITONES) * (endX - nutX);
    const svg = s('svg', { viewBox: `0 0 ${W} ${top * 2 + gap * 3}`, class: 'fingerboard', role: 'img', 'aria-label': 'Violin fingerboard' });
    svg.style.setProperty('--c', this.color);
    svg.append(
      s('path', { d: `M${nutX} ${top - 30} L${endX + 20} ${top - 38} L${endX + 20} ${top + gap * 3 + 38} L${nutX} ${top + gap * 3 + 30} Z`, class: 'fb-board' }),
      s('rect', { x: nutX - 8, y: top - 32, width: 8, height: gap * 3 + 64, rx: 2, fill: '#efe8ff', opacity: 0.85 }),
      s('rect', { x: endX + 40, y: top - 40, width: W - endX - 50, height: gap * 3 + 80, rx: 26, class: 'strum-zone' }),
      s('text', { x: endX + 40 + (W - endX - 50) / 2, y: top + gap * 1.5 + 5, class: 'fb-num' }, 'Bow'),
    );
    // Position guide tapes (like a beginner violin): whole and half steps from the open string
    for (let semi = 1; semi <= SEMITONES; semi++) {
      const major = [2, 4, 5, 7, 9, 11, 12, 14, 16].includes(semi);
      svg.append(s('line', { x1: xOf(semi), y1: top - 26, x2: xOf(semi), y2: top + gap * 3 + 26, class: major ? 'tape' : 'tape minor' }));
    }
    const lines: SVGLineElement[] = [];
    STRINGS.forEach((_, i) => {
      const y = top + i * gap;
      const line = s('line', { x1: 0, y1: y, x2: W - 10, y2: y, class: 'fb-string', 'stroke-width': 3 - i * 0.5 });
      lines.push(line);
      svg.append(line, s('text', { x: 18, y: y - 8, class: 'fb-label' }, STRING_NAMES[i]));
    });
    const finger = s('circle', { cx: -50, cy: -50, r: 13, class: 'fb-dot finger' });
    svg.append(finger);

    const tunerNote = h('span', { class: 'now-chord-name' }, '—');
    const tunerCents = h('span', { class: 'now-chord-sub' }, 'Touch a string');
    const needle = h('div', { class: 'tuner-needle' });
    const tuner = h('div', { class: 'tuner' }, h('div', { class: 'now-chord' }, tunerNote, tunerCents), h('div', { class: 'tuner-scale' }, needle));

    const showPitch = (midi: number) => {
      const nearest = Math.round(midi);
      const cents = Math.round((midi - nearest) * 100);
      tunerNote.textContent = pretty(noteName(nearest));
      tunerCents.textContent = `${midiToFreq(midi).toFixed(1)} Hz  ${cents === 0 ? 'in tune' : (cents > 0 ? '+' : '') + cents + ' cents'}`;
      needle.style.setProperty('--cents', String(cents));
      needle.classList.toggle('in-tune', Math.abs(cents) <= 3);
    };

    const toLocal = (e: PointerEvent) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    };
    const pitchAt = (x: number, y: number) => {
      const string = clamp(Math.round((y - top) / gap), 0, 3);
      let semi = clamp(((x - nutX) / (endX - nutX)) * SEMITONES, 0, SEMITONES);
      if (x > endX + 30) semi = 0; // bowing area = open string
      if (this.settings.snap) semi = Math.round(semi);
      return { string, midi: STRINGS[string] + semi, semi };
    };
    const place = (string: number, semi: number) => {
      finger.setAttribute('cx', String(semi === 0 ? nutX - 22 : xOf(semi)));
      finger.setAttribute('cy', String(top + string * gap));
    };

    let activeString = -1;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      const { x, y } = toLocal(e);
      const p = pitchAt(x, y);
      activeString = p.string;
      place(p.string, p.semi);
      this.liveOn('mouse', p.midi, p.string);
      showPitch(p.midi);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (activeString < 0) return;
      const { x, y } = toLocal(e);
      const p = pitchAt(x, y);
      place(p.string, p.semi);
      if (p.string !== activeString) {
        activeString = p.string;
        this.liveOn('mouse', p.midi, p.string);
      } else this.liveMove('mouse', p.midi, p.string);
      showPitch(p.midi);
    });
    const end = () => {
      activeString = -1;
      this.liveOff('mouse');
      finger.setAttribute('cx', '-50');
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    d.add(() => this.liveOff('mouse'));

    d.add(
      this.visual.on('hit', (e) => {
        const line = lines[e.string ?? 0];
        line?.animate?.([{ stroke: this.color, strokeWidth: '6px' }, { stroke: '', strokeWidth: '' }], { duration: 700, easing: 'ease-out' });
        if (e.midi !== undefined) showPitch(e.midi);
      }),
    );

    el.append(
      tuner,
      h('div', { class: 'stage-instrument' }, svg),
      h(
        'p',
        { class: 'stage-help' },
        'Hold a string to bow it and slide to change pitch. Turn off pitch snap for free, fretless intonation. Keyboard: ',
        h('kbd', {}, 'A'),
        ' to ',
        h('kbd', {}, "'"),
        ' play notes from middle C.',
      ),
    );
  }

  mountPlayPanel({ el, d }: Host): void {
    const pad = chordPad({ store: this.ctx.store, d, hotkeys: true, onChord: (c) => this.previewChord(c) });
    d.add(this.visual.on('chord', ({ chord }) => pad.setActive(chord)));
    el.append(
      section(
        'Technique',
        null,
        field('Play with', segmented<ViolinSettings['articulation']>([{ value: 'arco', label: 'Bow' }, { value: 'pizz', label: 'Pluck' }], this.settings.articulation, (v) => this.updateSettings({ articulation: v }))),
        toggle('Pitch snap (perfect intonation)', this.settings.snap, (v) => this.updateSettings({ snap: v })),
        toggle('Vibrato', this.settings.vibrato, (v) => this.updateSettings({ vibrato: v })),
      ),
      section('Double stops', 'Plays two notes of the chord at once.', pad.el),
    );
  }

  mountAutoPanel(host: Host, draft: Draft<ViolinAutomation>): void {
    this.mountProgressionSection(host, draft);
    const hint = h('p', { class: 'hint' });
    const setHint = (id: string) => (hint.textContent = VIOLIN_STYLES.find((s) => s.id === id)?.hint ?? '');
    const style = selectBox(
      VIOLIN_STYLES.map((s) => ({ value: s.id, label: s.name })),
      draft.get().style,
      (v) => {
        draft.set({ ...draft.get(), style: v });
        setHint(v);
      },
    );
    setHint(draft.get().style);
    const reg = segmented<ViolinAutomation['register']>([{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }], draft.get().register, (v) => draft.set({ ...draft.get(), register: v }));
    host.d.add(
      draft.onChange((a) => {
        style.value = a.style;
        reg.set(a.register);
        setHint(a.style);
      }),
    );
    host.el.append(section('Part', null, field('Style', style), hint, field('Register', reg)));
  }

  private keyNotes = new Map<string, number>();

  onKey(e: KeyboardEvent, down: boolean): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    const idx = KEY_LAYOUT.indexOf(k);
    if (idx >= 0) {
      if (down && !this.keyNotes.has(k)) {
        const midi = 60 + idx;
        this.keyNotes.set(k, midi);
        this.liveOn('key:' + k, midi);
      } else if (!down) {
        this.keyNotes.delete(k);
        this.liveOff('key:' + k);
      }
      return true;
    }
    if (down && !e.repeat) {
      const chord = this.hotkeyChord(e);
      if (chord) {
        this.previewChord(chord);
        return true;
      }
    }
    return false;
  }
}

