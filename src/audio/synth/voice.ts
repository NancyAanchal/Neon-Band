/** A sounding note that can be stopped (damped) later. */
export interface Voice {
  stop(time?: number, release?: number): void;
}

/** Play a pre-rendered buffer at an exact time. */
export function playBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, dest: AudioNode, time: number, gain = 1, rate = 1): Voice {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(dest);
  src.start(time);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
  };
  let stopped = false;
  return {
    stop(t = ctx.currentTime, release = 0.04) {
      if (stopped) return;
      stopped = true;
      const at = Math.max(t, time, ctx.currentTime);
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(gain, at);
      g.gain.setTargetAtTime(0, at, release / 4);
      try {
        src.stop(at + release * 2 + 0.02);
      } catch {
        /* already stopped */
      }
    },
  };
}

/** Lazily renders and caches one AudioBuffer per (note, variant). */
export class BufferBank {
  private cache = new Map<string, AudioBuffer>();
  constructor(private readonly render: (midi: number, variant: string) => AudioBuffer) {}

  get(midi: number, variant = 'normal'): AudioBuffer {
    const key = midi + '|' + variant;
    let b = this.cache.get(key);
    if (!b) {
      b = this.render(midi, variant);
      this.cache.set(key, b);
    }
    return b;
  }

  has(midi: number, variant = 'normal'): boolean {
    return this.cache.has(midi + '|' + variant);
  }

  /** Pre-render notes during idle time so the first press is instant. */
  warm(midis: number[], variant = 'normal'): void {
    const queue = [...midis];
    const idle: (cb: () => void) => void = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb) => setTimeout(cb, 30));
    const next = () => {
      const m = queue.shift();
      if (m === undefined) return;
      if (!this.has(m, variant)) this.get(m, variant);
      idle(next);
    };
    idle(next);
  }
}

export function fadeTail(data: Float32Array, sampleRate: number, seconds = 0.05): void {
  const n = Math.min(data.length, Math.floor(sampleRate * seconds));
  for (let i = 0; i < n; i++) data[data.length - 1 - i] *= i / n;
}

export function normalize(data: Float32Array, peak = 0.8): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }
}
