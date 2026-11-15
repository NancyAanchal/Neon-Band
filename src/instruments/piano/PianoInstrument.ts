import { renderPiano } from '../../audio/synth/piano';
import { BufferBank, playBuffer, type Voice } from '../../audio/synth/voice';
import { PROGRESSION_PRESETS, average, closeVoicing, resolvePreset, rootIn, type Chord, type Progression } from '../../music/chords';
import { chordPad } from '../../ui/components/ChordPad';
import { field, section, segmented, selectBox, stepper, toggle } from '../../ui/components/controls';
import { h } from '../../ui/dom';
import { ChordInstrument } from '../ChordInstrument';
import type { Draft, Host } from '../Instrument';
import { KEY_LAYOUT, KeyboardView } from '../shared/KeyboardView';
import { pianoArt } from './art';
import { PIANO_STYLES } from './pianoStyles';

export interface PianoSettings {
  /** Octave shift for the on-screen and computer keyboard. */
  octave: number;
  sustain: boolean;
}

export interface PianoAutomation {
  progression: Progression;
  style: string;
  register: 'low' | 'mid' | 'high';
}

const REGISTER_CENTER = { low: 57, mid: 65, high: 74 };
const MAX_VOICES = 56;

export class PianoInstrument extends ChordInstrument<PianoAutomation, PianoSettings> {
  readonly id = 'piano';
  readonly name = 'Piano';
  readonly color = '#2ee6ff';
  readonly blurb = 'Three octaves you can play with your keyboard';

  private bank!: BufferBank;
  private input!: GainNode;
  private active = new Map<number, Voice[]>();
  private sustained = new Set<number>();
  private allVoices: Voice[] = [];
  private pedal = false;
  private lastCenter = 65;
  private lastChordKey = '';
  private rh: number[] = [];

  protected channelOptions() {
    return { pan: 0.2, reverb: 0.3 };
  }

  protected buildAudio(): void {
    const ctx = this.audio;
    this.bank = new BufferBank((midi) => renderPiano(ctx, midi));
    this.input = ctx.createGain();
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.value = 180;
    warmth.gain.value = 2;
    this.input.connect(warmth).connect(this.channel.input);
    // Pre-render the middle of the keyboard in idle time
    const order: number[] = [];
    for (let d = 0; d <= 24; d++) order.push(60 + d, 60 - d - 1);
    this.bank.warm(order.filter((m) => m >= 33 && m <= 88));
  }

  protected applySettings(): void {
    this.setPedal(this.settings.sustain || this.pedal);
  }

  defaultSettings(): PianoSettings {
    return { octave: 0, sustain: false };
  }

  defaultAutomation(): PianoAutomation {
    return { progression: resolvePreset(PROGRESSION_PRESETS[0], { root: 0, mode: 'major' }), style: 'pulse', register: 'mid' };
  }

  roomArt(): string {
    return pianoArt;
  }

  // ------------------------------------------------------------ sound

  noteOn(midi: number, time = this.now, velocity = 0.75): Voice {
    const v = playBuffer(this.audio, this.bank.get(midi), this.input, time, 0.25 + velocity * 0.65);
    const list = this.active.get(midi) ?? [];
    list.push(v);
    this.active.set(midi, list);
    this.allVoices.push(v);
    if (this.allVoices.length > MAX_VOICES) this.allVoices.shift()!.stop(time, 0.1);
    this.sustained.delete(midi);
    this.show(time, 'hit', { key: String(midi), midi, velocity });
    return v;
  }

  noteOff(midi: number, time = this.now): void {
    this.show(time, 'release', { key: String(midi) });
    if (this.pedal || this.settings.sustain) {
      this.sustained.add(midi);
      return;
    }
    this.damp(midi, time);
  }

  private damp(midi: number, time: number): void {
    const list = this.active.get(midi);
    if (!list) return;
    list.forEach((v) => v.stop(time, 0.28));
    this.active.delete(midi);
  }

  setPedal(down: boolean): void {
    this.pedal = down;
    if (!down && !this.settings.sustain) {
      this.sustained.forEach((m) => this.damp(m, this.now));
      this.sustained.clear();
    }
  }

  chordNotes(chord: Chord): number[] {
    return [rootIn(chord, 41), ...closeVoicing(chord, 64)];
  }

  previewChord(chord: Chord): void {
    const t = this.now;
    this.chordNotes(chord).forEach((m, i) => {
      const v = this.noteOn(m, t + i * 0.004, 0.65);
      if (!this.settings.sustain) v.stop(t + 1.8, 0.4);
      this.show(t + 1.6, 'release', { key: String(m) });
    });
    this.show(t, 'chord', { chord });
  }

  silence(): void {
    this.allVoices.forEach((v) => v.stop(this.now, 0.2));
    this.allVoices = [];
    this.active.clear();
  }

  // ------------------------------------------------------------ loop

  scheduleStep(localStep: number, time: number, stepDur: number): void {
    const a = this.automation;
    const pos = this.loopChord(localStep);
    if (!pos) return;
    if (localStep === 0) this.lastCenter = REGISTER_CENTER[a.register];
    if (pos.stepInSlot === 0 || this.lastChordKey === '') {
      this.rh = closeVoicing(pos.chord, this.lastCenter, 4);
      this.lastCenter = average(this.rh) * 0.6 + REGISTER_CENTER[a.register] * 0.4;
      this.lastChordKey = `${pos.index}`;
      this.show(time, 'chord', { chord: pos.chord });
    }
    const style = PIANO_STYLES.find((s) => s.id === a.style) ?? PIANO_STYLES[0];
    const lh = rootIn(pos.chord, a.register === 'high' ? 45 : 36);
    const events = style.play({ chord: pos.chord, stepInSlot: pos.stepInSlot, stepInBar: pos.stepInSlot % 16, slotSteps: pos.slotSteps, rh: this.rh, lh });
    for (const ev of events) {
      const len = Math.min(ev.len, pos.slotSteps - pos.stepInSlot) * stepDur;
      ev.notes.forEach((m, i) => {
        const t = time + i * 0.003;
        const v = this.noteOn(m, t, ev.vel * (0.94 + Math.random() * 0.06));
        v.stop(t + len, 0.22);
        this.show(t + len, 'release', { key: String(m) });
      });
    }
  }

  // ------------------------------------------------------------ UI

  private baseNote(): number {
    return 48 + this.settings.octave * 12;
  }

  private keyLabels(): Map<number, string> {
    const m = new Map<number, string>();
    KEY_LAYOUT.forEach((k, i) => m.set(this.baseNote() + 12 + i, k.toUpperCase()));
    return m;
  }

  mountStage({ el, d }: Host): void {
    const held = new Set<number>();
    const kb = new KeyboardView({
      low: this.baseNote(),
      high: this.baseNote() + 36,
      color: this.color,
      labels: this.keyLabels(),
      onDown: (m) => {
        held.add(m);
        this.noteOn(m);
      },
      onUp: (m) => {
        held.delete(m);
        this.noteOff(m);
      },
    });
    const pedal = h('div', { class: 'pedal' + (this.settings.sustain ? ' down' : '') }, 'Sustain');
    d.add(this.visual.on('hit', (e) => kb.press(e.midi!, true)));
    d.add(this.visual.on('release', (e) => kb.press(Number(e.key), false)));
    d.add(
      this.ctx.store.events.on('change', ({ action }) => {
        if (action.type === 'setSettings' && action.id === this.id) {
          kb.setRange(this.baseNote(), this.baseNote() + 36, this.keyLabels());
          pedal.classList.toggle('down', this.settings.sustain || this.pedal);
        }
      }),
    );
    this.pedalEl = pedal;
    d.add(() => (this.pedalEl = null));
    el.append(
      h('div', { class: 'stage-instrument piano-wrap' }, h('div', { class: 'piano-body' }, kb.el), pedal),
      h(
        'p',
        { class: 'stage-help' },
        'Click or glide across the keys. Keyboard: ',
        h('kbd', {}, 'A'),
        ' to ',
        h('kbd', {}, "'"),
        ' play notes, ',
        h('kbd', {}, 'Z'),
        ' / ',
        h('kbd', {}, 'X'),
        ' shift octave, hold ',
        h('kbd', {}, 'Space'),
        ' for the sustain pedal, ',
        h('kbd', {}, '1'),
        '–',
        h('kbd', {}, '7'),
        ' chords.',
      ),
    );
  }

  private pedalEl: HTMLElement | null = null;
  private octaveStepper: (HTMLElement & { set(v: number): void }) | null = null;

  mountPlayPanel({ el, d }: Host): void {
    const pad = chordPad({ store: this.ctx.store, d, hotkeys: true, onChord: (c) => this.previewChord(c) });
    d.add(this.visual.on('chord', ({ chord }) => pad.setActive(chord)));
    const oct = stepper(this.settings.octave, -2, 2, (v) => this.updateSettings({ octave: v }), (v) => (v === 0 ? 'Middle' : v > 0 ? `+${v}` : String(v)));
    this.octaveStepper = oct;
    d.add(() => (this.octaveStepper = null));
    el.append(
      section('Keyboard', null, field('Octave', oct), toggle('Sustain pedal (stays down)', this.settings.sustain, (v) => this.updateSettings({ sustain: v }))),
      section('Chords', 'Plays the chord with a bass note in the left hand.', pad.el),
    );
  }

  mountAutoPanel(host: Host, draft: Draft<PianoAutomation>): void {
    this.mountProgressionSection(host, draft);
    const style = selectBox(PIANO_STYLES.map((s) => ({ value: s.id, label: s.name })), draft.get().style, (v) => draft.set({ ...draft.get(), style: v }));
    const reg = segmented<PianoAutomation['register']>(
      [
        { value: 'low', label: 'Low' },
        { value: 'mid', label: 'Middle' },
        { value: 'high', label: 'High' },
      ],
      draft.get().register,
      (v) => draft.set({ ...draft.get(), register: v }),
    );
    host.d.add(
      draft.onChange((a) => {
        style.value = a.style;
        reg.set(a.register);
      }),
    );
    host.el.append(section('Playing style', 'Chords move smoothly from one to the next, like a real pianist.', field('Style', style), field('Register', reg)));
  }

  private keysDown = new Map<string, number>();

  onKey(e: KeyboardEvent, down: boolean): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') {
      if (e.repeat) return true;
      this.setPedal(down);
      this.pedalEl?.classList.toggle('down', down || this.settings.sustain);
      return true;
    }
    if (down && !e.repeat && (k === 'z' || k === 'x')) {
      const v = Math.max(-2, Math.min(2, this.settings.octave + (k === 'z' ? -1 : 1)));
      this.updateSettings({ octave: v });
      this.octaveStepper?.set(v);
      return true;
    }
    const idx = KEY_LAYOUT.indexOf(k);
    if (idx >= 0) {
      if (down && !this.keysDown.has(k)) {
        const midi = this.baseNote() + 12 + idx;
        this.keysDown.set(k, midi);
        this.noteOn(midi);
      } else if (!down) {
        const midi = this.keysDown.get(k);
        this.keysDown.delete(k);
        if (midi !== undefined) this.noteOff(midi);
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
