import { EventBus } from '../core/EventBus';

/** Called for every 16th note, slightly ahead of time. `time` is the exact AudioContext time to play at. */
export type StepListener = (step: number, time: number, stepDuration: number) => void;

type TransportEvents = {
  /** Fired (visually in sync) when a step becomes audible. */
  step: { step: number };
  state: { playing: boolean };
};

export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = 16;

/**
 * Lookahead scheduler ("A Tale of Two Clocks"): a JS timer wakes up often and schedules
 * every note that falls in the next ~120 ms with sample-accurate AudioContext times.
 * This keeps the band perfectly tight even if the UI is busy.
 */
export class Transport {
  bpm = 100;
  swing = 0;
  readonly events = new EventBus<TransportEvents>();
  private listeners = new Set<StepListener>();
  private _playing = false;
  private step = 0;
  private nextTime = 0;
  private timer: number | undefined;
  private visualQueue: { time: number; fn: () => void }[] = [];

  constructor(private readonly ctx: AudioContext) {
    const loop = () => {
      this.flushVisuals();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get playing(): boolean {
    return this._playing;
  }

  /** Seconds per 16th note. */
  get stepDuration(): number {
    return 60 / this.bpm / STEPS_PER_BEAT;
  }

  onStep(fn: StepListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  start(): void {
    if (this._playing) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this._playing = true;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
    this.events.emit('state', { playing: true });
  }

  stop(): void {
    if (!this._playing) return;
    this._playing = false;
    window.clearInterval(this.timer);
    this.visualQueue = [];
    this.events.emit('state', { playing: false });
  }

  /** First step of the next bar: loops that start mid-song wait for it, so they land on the downbeat. */
  nextBarStep(): number {
    if (!this._playing) return 0;
    return Math.ceil(this.step / STEPS_PER_BAR) * STEPS_PER_BAR;
  }

  /** Run `fn` on the next animation frame after AudioContext time `time` (for visuals synced to sound). */
  atTime(time: number, fn: () => void): void {
    this.visualQueue.push({ time, fn });
  }

  private tick(): void {
    // Background tabs throttle timers to ~1 s, so look further ahead when hidden.
    const lookahead = document.hidden ? 1.5 : 0.12;
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      const dur = this.stepDuration;
      const time = this.nextTime + (this.step % 2 === 1 ? this.swing * dur * 0.66 : 0);
      const step = this.step;
      for (const l of this.listeners) {
        try {
          l(step, time, dur);
        } catch (e) {
          console.error('Step listener failed', e);
        }
      }
      this.atTime(time, () => this.events.emit('step', { step }));
      this.nextTime += dur;
      this.step++;
    }
  }

  private flushVisuals(): void {
    if (!this.visualQueue.length) return;
    const now = this.ctx.currentTime;
    const due: (() => void)[] = [];
    this.visualQueue = this.visualQueue.filter((v) => {
      if (v.time <= now) {
        due.push(v.fn);
        return false;
      }
      return true;
    });
    for (const fn of due) fn();
  }
}
