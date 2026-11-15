import type { AudioEngine, Channel, ChannelOptions } from '../audio/AudioEngine';
import type { Transport } from '../audio/Transport';
import { EventBus, type Unsubscribe } from '../core/EventBus';
import type { Store } from '../core/Store';
import type { InstrumentState } from '../core/types';
import type { Chord, Progression } from '../music/chords';
import type { Disposer } from '../ui/dom';

/** Shared services every instrument gets. */
export interface InstrumentContext {
  engine: AudioEngine;
  transport: Transport;
  store: Store;
  /** All instruments in the band (e.g. for "copy chords from…"). */
  band: () => Instrument[];
}

/** Where to mount some UI, plus a Disposer that is cleaned up when that UI goes away. */
export interface Host {
  el: HTMLElement;
  d: Disposer;
}

/** A working copy of an instrument's loop settings, edited in the loop builder. */
export interface Draft<A> {
  get(): A;
  set(next: A): void;
  onChange(fn: (a: A) => void): Unsubscribe;
}

/** Events that tell views what to light up, fired exactly when the sound is heard. */
export type VisualEvents = {
  hit: { key: string; midi?: number; string?: number; fret?: number; velocity?: number };
  release: { key: string };
  chord: { chord: Chord | null };
};

/**
 * Base class for every instrument.
 *
 * To add a new instrument:
 *  1. Create a folder in src/instruments/<name>/ with a class extending Instrument (or ChordInstrument).
 *  2. Implement the abstract members below.
 *  3. Add it to src/instruments/registry.ts.
 * The room, mixer, save/load and loop system pick it up automatically.
 */
export abstract class Instrument<A = unknown, S = unknown> {
  abstract readonly id: string;
  abstract readonly name: string;
  /** Neon color used everywhere for this instrument. */
  abstract readonly color: string;
  /** One-line description shown in the room. */
  abstract readonly blurb: string;
  readonly defaultVolume: number = 0.8;
  readonly visual = new EventBus<VisualEvents>();
  protected channel!: Channel;

  constructor(protected readonly ctx: InstrumentContext) {}

  /** Called once, after the store exists. Builds the audio graph. */
  setup(): void {
    this.channel = this.ctx.engine.channel(this.id, this.channelOptions());
    this.buildAudio();
    this.ctx.store.events.on('change', ({ action }) => {
      if ((action.type === 'setSettings' && action.id === this.id) || action.type === 'loadSong') this.applySettings();
      if ((action.type === 'setLoop' && action.id === this.id && !action.enabled) || action.type === 'stopAllLoops') this.silence();
    });
    this.applySettings();
  }

  protected channelOptions(): ChannelOptions {
    return {};
  }

  /** Create synths / effect nodes. Connect them to `this.channel.input`. */
  protected buildAudio(): void {}

  /** React to settings changes (e.g. switch tone). */
  protected applySettings(): void {}

  abstract defaultAutomation(): A;
  abstract defaultSettings(): S;

  /** The big, playable instrument in the middle of the instrument screen. */
  abstract mountStage(host: Host): void;
  /** Sidebar "Play" tab: chord buttons, sounds, settings. */
  abstract mountPlayPanel(host: Host): void;
  /** Sidebar "Loop builder" tab: edits a draft of the automation. */
  abstract mountAutoPanel(host: Host, draft: Draft<A>): void;
  /** Schedule whatever this instrument plays on one 16th-note step of its loop. */
  abstract scheduleStep(localStep: number, time: number, stepDuration: number): void;
  /** Neon line-art SVG markup for the room (viewBox 0 0 200 200, use currentColor). */
  abstract roomArt(): string;

  /** Computer keyboard input while this instrument is open. Return true if handled. */
  onKey(_e: KeyboardEvent, _down: boolean): boolean {
    return false;
  }

  /** Stop all ringing notes (called when its loop stops). */
  silence(): void {}

  /** Instruments that follow chords expose their progression (for "copy chords from…"). */
  getProgression(_automation?: A): Progression | null {
    return null;
  }

  withProgression(automation: A, _p: Progression): A {
    return automation;
  }

  // ------------------------------------------------------------ helpers

  get state(): InstrumentState<A, S> {
    return this.ctx.store.state.instruments[this.id] as InstrumentState<A, S>;
  }

  get settings(): S {
    return this.state.settings;
  }

  get automation(): A {
    return this.state.automation;
  }

  get isLooping(): boolean {
    return this.state.autoEnabled;
  }

  get audio(): BaseAudioContext {
    return this.ctx.engine.ctx;
  }

  get now(): number {
    return this.ctx.engine.ctx.currentTime;
  }

  /** The step of this instrument's loop that is audible right now (or null). */
  localStepFor(globalStep: number): number | null {
    const st = this.state;
    if (!st.autoEnabled || globalStep < st.startStep) return null;
    return globalStep - st.startStep;
  }

  updateSettings(patch: Partial<S>): void {
    this.ctx.store.dispatch({ type: 'setSettings', id: this.id, patch: patch as Record<string, unknown> });
  }

  /** Emit a visual event exactly when audio scheduled at `time` is heard. */
  protected show<K extends keyof VisualEvents>(time: number, type: K, payload: VisualEvents[K]): void {
    if (time <= this.now + 0.01) this.visual.emit(type, payload);
    else this.ctx.transport.atTime(time, () => this.visual.emit(type, payload));
  }
}
