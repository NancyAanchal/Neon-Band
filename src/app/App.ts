import { AudioEngine } from '../audio/AudioEngine';
import { STEPS_PER_BAR, Transport } from '../audio/Transport';
import { Store } from '../core/Store';
import type { Instrument, InstrumentContext } from '../instruments/Instrument';
import { createBand } from '../instruments/registry';
import { isTyping } from '../ui/dom';
import { instrumentScreen } from '../ui/screens/InstrumentScreen';
import { roomScreen } from '../ui/screens/RoomScreen';
import { splashScreen } from '../ui/screens/Splash';
import { defaultSong, loadSaved, mergeSong, saveSong } from './song';

export interface Screen {
  el: HTMLElement;
  dispose(): void;
  onKey?(e: KeyboardEvent, down: boolean): boolean;
}

type Transition = { kind: 'zoom-in' | 'zoom-out' | 'fade'; origin?: DOMRect | null };

/** Wires everything together: audio, transport, store, instruments and screens. */
export class App {
  readonly engine = new AudioEngine();
  readonly transport: Transport;
  readonly store: Store;
  readonly instruments: Instrument[];
  metronome = false;
  private screen: Screen | null = null;
  private saveTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.transport = new Transport(this.engine.ctx);
    const ctx = { engine: this.engine, transport: this.transport, band: () => this.instruments } as InstrumentContext;
    this.instruments = createBand(ctx);
    this.store = new Store(mergeSong(defaultSong(this.instruments), loadSaved()));
    ctx.store = this.store;
    this.instruments.forEach((i) => i.setup());

    this.syncAudio();
    this.store.events.on('change', () => {
      this.syncAudio();
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => saveSong(this.store.state), 400);
    });
    this.transport.onStep((step, time, dur) => this.onStep(step, time, dur));

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  instrument(id: string): Instrument | undefined {
    return this.instruments.find((i) => i.id === id);
  }

  boot(): void {
    this.mount(splashScreen(this), { kind: 'fade' });
  }

  showRoom(origin?: DOMRect | null): void {
    this.mount(roomScreen(this), { kind: this.screen ? 'zoom-out' : 'fade', origin });
  }

  showInstrument(id: string, opts: { origin?: DOMRect | null; tab?: 'play' | 'loop' } = {}): void {
    const inst = this.instrument(id);
    if (inst) this.mount(instrumentScreen(this, inst, opts.tab ?? 'play'), { kind: 'zoom-in', origin: opts.origin });
  }

  // ------------------------------------------------------------ transport

  async play(): Promise<void> {
    await this.engine.resume();
    if (this.transport.playing) return;
    this.store.dispatch({ type: 'resetLoopStarts' });
    this.transport.start();
  }

  stop(): void {
    this.transport.stop();
    this.instruments.forEach((i) => i.silence());
  }

  togglePlay(): void {
    if (this.transport.playing) this.stop();
    else void this.play();
  }

  /** Commit a loop and start it on the next bar line (starting the band if needed). */
  startLoop(id: string, automation: unknown): void {
    this.store.dispatch({ type: 'setAutomation', id, automation });
    this.store.dispatch({ type: 'setLoop', id, enabled: true, startStep: this.transport.nextBarStep() });
    if (!this.transport.playing) void this.play();
  }

  stopLoop(id: string): void {
    this.store.dispatch({ type: 'setLoop', id, enabled: false, startStep: 0 });
  }

  // ------------------------------------------------------------ internals

  private onStep(step: number, time: number, dur: number): void {
    if (this.metronome && step % 4 === 0) this.click(time, step % STEPS_PER_BAR === 0);
    for (const inst of this.instruments) {
      const local = inst.localStepFor(step);
      if (local === null) continue;
      try {
        inst.scheduleStep(local, time, dur);
      } catch (e) {
        console.error(`${inst.name} failed to play step ${local}`, e);
      }
    }
  }

  private click(time: number, accent: boolean): void {
    const ctx = this.engine.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.35, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(time);
    o.stop(time + 0.06);
  }

  private syncAudio(): void {
    const s = this.store.state;
    this.transport.bpm = s.bpm;
    this.transport.swing = s.swing;
    this.engine.setMasterVolume(s.masterVolume);
    for (const [id, st] of Object.entries(s.instruments)) {
      const ch = this.engine.getChannel(id);
      ch?.setVolume(st.volume);
      ch?.setMuted(st.muted);
    }
  }

  /** Keys whose keydown was used as a shortcut; their keyup must not "click" a focused button. */
  private handledKeys = new Set<string>();

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (isTyping(e)) return;
    if (this.screen?.onKey?.(e, down)) {
      e.preventDefault();
      if (down) this.handledKeys.add(e.code);
    } else if (!down && this.handledKeys.has(e.code)) {
      e.preventDefault();
    }
    if (!down) this.handledKeys.delete(e.code);
  }

  private mount(next: Screen, t: Transition): void {
    const prev = this.screen;
    this.screen = next;
    next.el.classList.add('screen');
    this.root.append(next.el);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 420;
    const origin = t.origin ? `${t.origin.left + t.origin.width / 2}px ${t.origin.top + t.origin.height / 2}px` : '50% 50%';
    const easing = 'cubic-bezier(.2,.7,.2,1)';

    if (prev) {
      prev.el.style.transformOrigin = origin;
      prev.el.style.pointerEvents = 'none';
      const out =
        t.kind === 'zoom-in'
          ? [{ transform: 'scale(1)', opacity: 1, filter: 'blur(0)' }, { transform: 'scale(1.8)', opacity: 0, filter: 'blur(6px)' }]
          : [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.92)', opacity: 0 }];
      const anim = prev.el.animate(out, { duration: dur, easing, fill: 'forwards' });
      anim.onfinish = () => {
        prev.dispose();
        prev.el.remove();
      };
    }
    next.el.style.transformOrigin = origin;
    const inFrames =
      t.kind === 'zoom-in'
        ? [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
        : t.kind === 'zoom-out'
          ? [{ transform: 'scale(1.5)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
          : [{ opacity: 0 }, { opacity: 1 }];
    next.el.animate(inFrames, { duration: dur, easing, delay: prev ? dur * 0.25 : 0, fill: 'backwards' });
  }
}
