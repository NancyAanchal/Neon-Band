/** Every drum sound, synthesized. Add a voice: add it to DRUM_VOICES and a case in `play`. */

export const DRUM_VOICES = ['kick', 'snare', 'rim', 'clap', 'hihat', 'openhat', 'tom1', 'tom2', 'tom3', 'crash', 'ride'] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const DRUM_LABELS: Record<DrumVoice, string> = {
  kick: 'Kick',
  snare: 'Snare',
  rim: 'Rim',
  clap: 'Clap',
  hihat: 'Hi-hat',
  openhat: 'Open hat',
  tom1: 'High tom',
  tom2: 'Mid tom',
  tom3: 'Floor tom',
  crash: 'Crash',
  ride: 'Ride',
};

const METAL_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

export class DrumSynth {
  private openHat: GainNode | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  play(voice: DrumVoice, time: number, vel = 1): void {
    switch (voice) {
      case 'kick':
        return this.kick(time, vel);
      case 'snare':
        return this.snare(time, vel);
      case 'rim':
        return this.rim(time, vel);
      case 'clap':
        return this.clap(time, vel);
      case 'hihat':
        this.chokeOpenHat(time);
        this.metal(time, vel * 0.55, 0.055, 7800, false);
        return;
      case 'openhat':
        this.chokeOpenHat(time);
        this.openHat = this.metal(time, vel * 0.5, 0.42, 7400, false);
        return;
      case 'tom1':
        return this.tom(time, vel, 230);
      case 'tom2':
        return this.tom(time, vel, 165);
      case 'tom3':
        return this.tom(time, vel, 110);
      case 'crash':
        this.metal(time, vel * 0.55, 1.9, 5200, true);
        return;
      case 'ride':
        this.metal(time, vel * 0.32, 1.1, 9000, false, 0.9);
        this.ping(time, vel * 0.08, 5100, 0.9);
        return;
    }
  }

  private env(time: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    g.connect(this.dest);
    return g;
  }

  private noiseSource(time: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(time, Math.random() * 1.5);
    src.stop(time + dur + 0.05);
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private kick(time: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(165, time);
    o.frequency.exponentialRampToValueAtTime(48, time + 0.11);
    o.frequency.exponentialRampToValueAtTime(40, time + 0.4);
    o.connect(this.env(time, vel * 1.1, 0.5));
    o.start(time);
    o.stop(time + 0.55);
    // Beater click
    this.noiseSource(time, 0.01).connect(this.filter('lowpass', 3500)).connect(this.env(time, vel * 0.35, 0.012));
  }

  private snare(time: number, vel: number): void {
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(200, time);
    body.frequency.exponentialRampToValueAtTime(160, time + 0.08);
    body.connect(this.env(time, vel * 0.6, 0.12));
    body.start(time);
    body.stop(time + 0.15);
    this.noiseSource(time, 0.25).connect(this.filter('highpass', 1300)).connect(this.filter('peaking', 4500, 1)).connect(this.env(time, vel * 0.75, 0.22));
  }

  private rim(time: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1750;
    o.connect(this.filter('bandpass', 1750, 4)).connect(this.env(time, vel * 0.55, 0.035));
    o.start(time);
    o.stop(time + 0.05);
    this.noiseSource(time, 0.03).connect(this.filter('bandpass', 3200, 2)).connect(this.env(time, vel * 0.3, 0.025));
  }

  private clap(time: number, vel: number): void {
    const bp = this.filter('bandpass', 1200, 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    [0, 0.011, 0.022].forEach((t) => {
      g.gain.setValueAtTime(vel * 0.9, time + t);
      g.gain.exponentialRampToValueAtTime(0.05, time + t + 0.009);
    });
    g.gain.setValueAtTime(vel * 0.7, time + 0.031);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    this.noiseSource(time, 0.25).connect(bp).connect(g).connect(this.dest);
  }

  private tom(time: number, vel: number, f: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.35, time);
    o.frequency.exponentialRampToValueAtTime(f, time + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.82, time + 0.45);
    o.connect(this.env(time, vel * 0.85, 0.45));
    o.start(time);
    o.stop(time + 0.5);
    this.noiseSource(time, 0.05).connect(this.filter('lowpass', 2500)).connect(this.env(time, vel * 0.15, 0.04));
  }

  /** 808-style metallic tone: six inharmonic squares through a band-pass, plus noise. */
  private metal(time: number, vel: number, decay: number, center: number, wash: boolean, base = 1): GainNode {
    const out = this.env(time, vel, decay);
    const bp = this.filter('bandpass', center, 0.9);
    const hp = this.filter('highpass', center * 0.75);
    bp.connect(hp).connect(out);
    const f0 = 205 * base;
    for (const r of METAL_RATIOS) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f0 * r;
      const g = this.ctx.createGain();
      g.gain.value = 0.18;
      o.connect(g).connect(bp);
      o.start(time);
      o.stop(time + decay + 0.05);
    }
    const ng = this.ctx.createGain();
    ng.gain.value = wash ? 0.9 : 0.45;
    this.noiseSource(time, decay).connect(ng).connect(hp);
    return out;
  }

  private ping(time: number, vel: number, f: number, decay: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = f;
    o.connect(this.env(time, vel, decay));
    o.start(time);
    o.stop(time + decay + 0.05);
  }

  private chokeOpenHat(time: number): void {
    if (!this.openHat) return;
    const g = this.openHat.gain;
    g.cancelScheduledValues(time);
    g.setTargetAtTime(0.0001, time, 0.01);
    this.openHat = null;
  }
}
