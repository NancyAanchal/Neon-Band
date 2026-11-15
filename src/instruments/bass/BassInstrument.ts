import { renderPluck, type PluckProfile } from '../../audio/synth/pluck';
import { BufferBank, playBuffer, type Voice } from '../../audio/synth/voice';
import { PROGRESSION_PRESETS, chordFifth, chordSeventh, chordThird, resolvePreset, rootIn, type Chord, type ChordPosition, type Progression } from '../../music/chords';
import { noteName, pretty } from '../../music/theory';
import { chordPad } from '../../ui/components/ChordPad';
import { field, section, segmented, selectBox } from '../../ui/components/controls';
import { h } from '../../ui/dom';
import { ChordInstrument } from '../ChordInstrument';
import type { Draft, Host } from '../Instrument';
import { Fretboard } from '../shared/Fretboard';
import { bassArt } from './art';
import { BASS_STYLES, type BassDegree } from './bassStyles';

export interface BassSettings {
  tone: 'finger' | 'pick';
}

export interface BassAutomation {
  progression: Progression;
  style: string;
  octave: 0 | 1;
}

const PROFILES: Record<BassSettings['tone'], PluckProfile> = {
  finger: { t60: (f) => Math.min(7, 5 * Math.pow(55 / f, 0.3)), brightness: 0.35, pickPosition: 0.22, maxDuration: 5 },
  pick: { t60: (f) => Math.min(6, 4.2 * Math.pow(55 / f, 0.3)), brightness: 0.75, pickPosition: 0.1, maxDuration: 4.5 },
};

/** E1 A1 D2 G2 */
const TUNING = [28, 33, 38, 43];
const LOWEST = 28;

export class BassInstrument extends ChordInstrument<BassAutomation, BassSettings> {
  readonly id = 'bass';
  readonly name = 'Bass';
  readonly color = '#9d6bff';
  readonly blurb = 'Four strings that lock in with the drums';
  readonly defaultVolume = 0.9;

  private bank!: BufferBank;
  private input!: GainNode;
  private voices: (Voice | null)[] = TUNING.map(() => null);
  private loopVoice: Voice | null = null;

  protected channelOptions() {
    return { pan: 0.05, reverb: 0.06 };
  }

  protected buildAudio(): void {
    const ctx = this.audio;
    this.bank = new BufferBank((midi, variant) => renderPluck(ctx, midi, PROFILES[(variant as BassSettings['tone']) ?? 'finger'] ?? PROFILES.finger));
    this.input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 90;
    low.gain.value = 5;
    // Gentle saturation for warmth
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4);
    }
    shaper.curve = curve;
    this.input.connect(shaper).connect(low).connect(lp).connect(this.channel.input);
    this.bank.warm(Array.from({ length: 24 }, (_, i) => LOWEST + i), 'finger');
  }

  defaultSettings(): BassSettings {
    return { tone: 'finger' };
  }

  defaultAutomation(): BassAutomation {
    return { progression: resolvePreset(PROGRESSION_PRESETS[0], { root: 0, mode: 'major' }), style: 'rock8', octave: 0 };
  }

  roomArt(): string {
    return bassArt;
  }

  // ------------------------------------------------------------ sound

  /** Where a note sits on the neck (lowest fret wins). */
  position(midi: number): { string: number; fret: number } {
    let best = { string: 0, fret: Math.max(0, midi - TUNING[0]) };
    TUNING.forEach((open, s) => {
      const f = midi - open;
      if (f >= 0 && f <= 15 && f < best.fret) best = { string: s, fret: f };
    });
    return best;
  }

  playNote(midi: number, time = this.now, velocity = 0.9, string?: number): Voice {
    const pos = string === undefined ? this.position(midi) : { string, fret: midi - TUNING[string] };
    this.voices[pos.string]?.stop(time, 0.03);
    const v = playBuffer(this.audio, this.bank.get(midi, this.settings.tone), this.input, time, velocity * 0.75);
    this.voices[pos.string] = v;
    this.show(time, 'hit', { key: `s${pos.string}`, string: pos.string, fret: pos.fret, midi, velocity });
    return v;
  }

  previewChord(chord: Chord): void {
    this.playNote(rootIn(chord, LOWEST));
    this.show(this.now, 'chord', { chord });
  }

  silence(): void {
    this.voices.forEach((v) => v?.stop());
    this.loopVoice?.stop();
  }

  private resolve(deg: BassDegree, pos: ChordPosition, octave: number): number {
    const root = rootIn(pos.chord, LOWEST) + octave * 12;
    switch (deg) {
      case 'R':
        return root;
      case '5':
        return root + chordFifth(pos.chord);
      case '8':
        return root + 12;
      case '3':
        return root + chordThird(pos.chord);
      case '7':
        return root + chordSeventh(pos.chord);
      case '6':
        return root + 9;
      case 'L5': {
        const n = root + chordFifth(pos.chord) - 12;
        return n >= LOWEST ? n : n + 12;
      }
      case 'A': {
        if (!pos.lastBarOfSlot) return root + 12;
        // Chromatic approach: a half step below (or above) the next chord's root
        const target = rootIn(pos.next, LOWEST) + octave * 12;
        return target - 1 >= LOWEST ? target - 1 : target + 1;
      }
    }
  }

  scheduleStep(localStep: number, time: number, stepDur: number): void {
    const a = this.automation;
    const pos = this.loopChord(localStep);
    if (!pos) return;
    if (pos.stepInSlot === 0) this.show(time, 'chord', { chord: pos.chord });
    const style = BASS_STYLES.find((s) => s.id === a.style) ?? BASS_STYLES[0];
    const inBar = pos.stepInSlot % 16;
    for (const n of style.notes) {
      if (n.step !== inBar || pos.stepInSlot + n.len > pos.slotSteps + 1) continue;
      const midi = this.resolve(n.deg, pos, a.octave);
      this.loopVoice?.stop(time, 0.03);
      const v = this.playNote(midi, time, (n.vel ?? 0.9) * (inBar === 0 ? 1 : 0.92));
      v.stop(time + n.len * stepDur * 0.92, 0.06);
      this.loopVoice = v;
    }
  }

  // ------------------------------------------------------------ UI

  mountStage({ el, d }: Host): void {
    const board = new Fretboard({
      tuning: TUNING,
      stringLabels: ['E', 'A', 'D', 'G'],
      frets: 15,
      color: this.color,
      spacing: 48,
      stringWidths: [5.5, 2.8],
      strumZone: false,
      getCapo: () => 0,
      onPluck: (string, fret) => this.playNote(TUNING[string] + fret, this.now, 0.9, string),
    });
    const noteLabel = h('div', { class: 'now-chord' }, h('span', { class: 'now-chord-name' }, '—'));
    d.add(
      this.visual.on('hit', (e) => {
        board.flash(e.string!, e.fret ?? null);
        noteLabel.replaceChildren(h('span', { class: 'now-chord-name' }, pretty(noteName(e.midi!))));
      }),
    );
    el.append(
      noteLabel,
      h('div', { class: 'stage-instrument' }, board.el),
      h('p', { class: 'stage-help' }, 'Click or drag along the strings to play. ', h('kbd', {}, '1'), '–', h('kbd', {}, '7'), ' play the root of each chord in the key.'),
    );
  }

  mountPlayPanel({ el, d }: Host): void {
    const pad = chordPad({ store: this.ctx.store, d, hotkeys: true, onChord: (c) => this.previewChord(c) });
    d.add(this.visual.on('chord', ({ chord }) => pad.setActive(chord)));
    el.append(
      section('Tone', null, segmented<BassSettings['tone']>([{ value: 'finger', label: 'Fingers' }, { value: 'pick', label: 'Pick' }], this.settings.tone, (v) => this.updateSettings({ tone: v }))),
      section('Chord roots', 'The bass usually plays the root of each chord. Tap a chord to hear its root.', pad.el),
    );
  }

  mountAutoPanel(host: Host, draft: Draft<BassAutomation>): void {
    this.mountProgressionSection(host, draft);
    const style = selectBox(
      BASS_STYLES.map((s) => ({ value: s.id, label: s.name })),
      draft.get().style,
      (v) => draft.set({ ...draft.get(), style: v }),
    );
    const octave = segmented<0 | 1>([{ value: 0, label: 'Low' }, { value: 1, label: 'High' }], draft.get().octave, (v) => draft.set({ ...draft.get(), octave: v }));
    host.d.add(
      draft.onChange((a) => {
        style.value = a.style;
        octave.set(a.octave);
      }),
    );
    host.el.append(section('Groove', 'How the bass moves through each chord. Walking and Funk lead into the next chord.', field('Style', style), field('Register', octave)));
  }

  onKey(e: KeyboardEvent, down: boolean): boolean {
    if (!down || e.repeat) return false;
    const chord = this.hotkeyChord(e);
    if (chord) {
      this.previewChord(chord);
      return true;
    }
    return false;
  }
}
