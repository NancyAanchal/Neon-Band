import { midiToFreq } from '../../music/theory';
import { fadeTail, normalize } from './voice';

/** How a plucked string behaves. Tweak these to change the guitar/bass tone. */
export interface PluckProfile {
  /** Seconds for the note to fade by 60 dB, as a function of frequency. */
  t60: (freq: number) => number;
  /** 0 = dark/thumb, 1 = bright/pick */
  brightness: number;
  /** Where along the string it is plucked (0..0.5). Smaller = more nasal/bright. */
  pickPosition: number;
  maxDuration: number;
}

/**
 * Karplus-Strong plucked string with an all-pass fractional delay, so every note is
 * tuned to a fraction of a cent (plain Karplus-Strong can be ~20 cents off on high notes).
 * variant 'muted' = palm-muted / chucked string.
 */
export function renderPluck(ctx: BaseAudioContext, midi: number, p: PluckProfile, variant = 'normal'): AudioBuffer {
  const sr = ctx.sampleRate;
  const freq = midiToFreq(midi);
  const muted = variant === 'muted';
  const t60 = muted ? 0.07 : p.t60(freq);
  const dur = muted ? 0.12 : Math.min(p.maxDuration, Math.max(0.3, t60));
  const N = Math.floor(sr * dur);

  // Loop delay = L samples + 0.5 (averaging filter) + d (all-pass) = exactly sr / freq
  const period = sr / freq;
  const L = Math.max(2, Math.floor(period - 0.6));
  const d = period - 0.5 - L;
  const C = (1 - d) / (1 + d);
  const g = Math.pow(0.001, 1 / (freq * t60));

  // Excitation: filtered noise burst with a pick-position comb
  const line = new Float32Array(L);
  for (let i = 0; i < L; i++) line[i] = Math.random() * 2 - 1;
  const k = 0.12 + 0.88 * (muted ? 0.3 : p.brightness);
  for (let pass = 0; pass < 2; pass++) {
    let y = line[L - 1];
    for (let i = 0; i < L; i++) {
      y += k * (line[i] - y);
      line[i] = y;
    }
  }
  const off = Math.max(1, Math.round(p.pickPosition * L));
  const ex = line.slice();
  let mean = 0;
  for (let i = 0; i < L; i++) {
    line[i] = ex[i] - ex[(i + off) % L];
    mean += line[i];
  }
  mean /= L;
  for (let i = 0; i < L; i++) line[i] -= mean;

  const buf = ctx.createBuffer(1, N, sr);
  const out = buf.getChannelData(0);
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let n = 0; n < N; n++) {
    const x = line[idx];
    const lp = g * 0.5 * (x + prev);
    prev = x;
    const ap = C * lp + apX - C * apY;
    apX = lp;
    apY = ap;
    line[idx] = ap;
    out[n] = x;
    idx++;
    if (idx === L) idx = 0;
  }
  normalize(out, muted ? 0.45 : 0.8);
  fadeTail(out, sr, muted ? 0.03 : 0.08);
  return buf;
}
