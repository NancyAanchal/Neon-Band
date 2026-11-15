/**
 * Owns the AudioContext and the mixer.
 *
 *   instrument -> Channel(volume, mute, pan) --+--> master -> compressor -> limiter -> analyser -> speakers
 *                                              +--> reverb send -> convolver --^
 */

export interface ChannelOptions {
  pan?: number;
  /** Reverb send amount 0..1 */
  reverb?: number;
}

export class Channel {
  /** Instruments connect their sound here. */
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  private readonly volume: GainNode;
  private readonly muteGain: GainNode;
  private readonly data: Float32Array;

  constructor(private readonly ctx: AudioContext, dest: AudioNode, reverb: AudioNode, opts: ChannelOptions) {
    this.input = ctx.createGain();
    this.volume = ctx.createGain();
    this.muteGain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = opts.pan ?? 0;
    const send = ctx.createGain();
    send.gain.value = opts.reverb ?? 0.2;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Float32Array(this.analyser.fftSize);

    this.input.connect(this.volume).connect(this.muteGain).connect(panner);
    panner.connect(dest);
    panner.connect(send).connect(reverb);
    this.muteGain.connect(this.analyser);
  }

  setVolume(v: number): void {
    this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  setMuted(muted: boolean): void {
    this.muteGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  /** Current loudness 0..~1 (RMS). Used for the neon glow in the room. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) sum += this.data[i] * this.data[i];
    return Math.sqrt(sum / this.data.length);
  }
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  /** 2 seconds of white noise, shared by drums, bows, etc. */
  readonly noise: AudioBuffer;
  private readonly master: GainNode;
  private readonly reverbIn: GainNode;
  private readonly channels = new Map<string, Channel>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.2;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;

    this.master.connect(comp).connect(limiter).connect(this.analyser).connect(ctx.destination);

    this.reverbIn = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.6, 3.4);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.8;
    this.reverbIn.connect(convolver).connect(reverbOut).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Get (or create) the mixer channel for an instrument. */
  channel(id: string, opts: ChannelOptions = {}): Channel {
    let ch = this.channels.get(id);
    if (!ch) {
      ch = new Channel(this.ctx, this.master, this.reverbIn, opts);
      this.channels.set(id, ch);
    }
    return ch;
  }

  getChannel(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  setMasterVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }
}

/** Synthetic room impulse response: decaying stereo noise. */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const pre = Math.floor(ctx.sampleRate * 0.012);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
