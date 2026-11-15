/**
 * Real-time bowed string (violin). Two detuned sawtooths (a bowed string's waveform is close to a saw)
 * shaped by violin body resonances, with delayed vibrato and a little bow-hair noise.
 * Pitch can glide continuously, so it slides like a real fretless string.
 */
export interface BowedOptions {
  velocity?: number;
  vibrato?: boolean;
  attack?: number;
}

export class BowedVoice {
  private readonly oscs: OscillatorNode[] = [];
  private readonly env: GainNode;
  private readonly vibDepth: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly noiseSrc: AudioBufferSourceNode;
  private freq: number;
  private released = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    noise: AudioBuffer,
    freq: number,
    time: number,
    private readonly opts: BowedOptions = {},
  ) {
    this.freq = freq;
    const vel = opts.velocity ?? 0.8;
    const mix = ctx.createGain();
    mix.gain.value = 0.32;

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 5.6;
    this.vibDepth = ctx.createGain();
    this.vibDepth.gain.value = 0;
    this.lfo.connect(this.vibDepth);
    if (opts.vibrato !== false) {
      this.vibDepth.gain.setValueAtTime(0, time);
      this.vibDepth.gain.linearRampToValueAtTime(freq * 0.0055, time + 0.45);
    }

    for (const det of [0, 5, -3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      this.vibDepth.connect(o.frequency);
      o.connect(mix);
      this.oscs.push(o);
    }

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 190;
    const air = peaking(ctx, 280, 1.4, 5);
    const wood = peaking(ctx, 470, 1.6, 4);
    const bridge = peaking(ctx, 2700, 1.1, 6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6200;
    lp.Q.value = 0.5;

    this.env = ctx.createGain();
    this.env.gain.value = 0;
    const attack = opts.attack ?? 0.07;
    this.env.gain.setValueAtTime(0, time);
    this.env.gain.setTargetAtTime(vel, time, attack / 2.5);

    mix.connect(hp).connect(air).connect(wood).connect(bridge).connect(lp).connect(this.env).connect(dest);

    // Bow noise (rosin scratch)
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = noise;
    this.noiseSrc.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 3200;
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.value = 0.035;
    this.noiseSrc.connect(nf).connect(ng).connect(this.env);

    this.lfo.start(time);
    this.noiseSrc.start(time, Math.random());
    this.oscs.forEach((o) => o.start(time));
  }

  /** Slide to a new pitch (glide = portamento time in seconds). */
  setFreq(freq: number, time = this.ctx.currentTime, glide = 0.03): void {
    this.freq = freq;
    for (const o of this.oscs) o.frequency.setTargetAtTime(freq, time, glide / 3);
    if (this.opts.vibrato !== false) this.vibDepth.gain.setTargetAtTime(freq * 0.0055, time, 0.05);
  }

  get frequency(): number {
    return this.freq;
  }

  release(time = this.ctx.currentTime, rel = 0.16): void {
    if (this.released) return;
    this.released = true;
    const at = Math.max(time, this.ctx.currentTime);
    this.env.gain.cancelScheduledValues(at);
    this.env.gain.setTargetAtTime(0, at, rel / 3);
    const end = at + rel * 2.5;
    this.oscs.forEach((o) => o.stop(end));
    this.lfo.stop(end);
    this.noiseSrc.stop(end);
    this.oscs[0].onended = () => this.env.disconnect();
  }
}

function peaking(ctx: BaseAudioContext, freq: number, q: number, gain: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'peaking';
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}
