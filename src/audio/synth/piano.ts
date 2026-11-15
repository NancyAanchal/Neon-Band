import { clamp, midiToFreq } from '../../music/theory';
import { fadeTail, normalize } from './voice';

/**
 * Additive piano: each note is a sum of slightly inharmonic partials (real piano strings are stiff,
 * so overtones sit a little sharp), two detuned "strings" per partial for the chorus/beating,
 * two-stage decay (fast "prompt" sound + long "aftersound"), and a felt-hammer thump.
 */
export function renderPiano(ctx: BaseAudioContext, midi: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const f0 = midiToFreq(midi);
  const T1 = clamp(7 * Math.pow(261.6 / f0, 0.55), 0.9, 13);
  const dur = Math.min(6, T1 * 0.8 + 0.6);
  const N = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, N, sr);
  const out = buf.getChannelData(0);

  const B = clamp(0.00004 * Math.pow(f0 / 65, 1.1), 0.00001, 0.0006);
  const maxPartials = Math.min(16, Math.floor((sr * 0.45) / f0));
  // Symmetric detune around the true pitch (two strings per note, ~1.5 cents apart)
  const detunes = [0.99956, 1.00044];
  // Normalise so the fundamental lands exactly on f0, even with inharmonicity
  const stretch = Math.sqrt(1 + B);

  for (let n = 1; n <= maxPartials; n++) {
    const fn = (n * f0 * Math.sqrt(1 + B * n * n)) / stretch;
    if (fn > sr * 0.45) break;
    const amp = Math.pow(n, -1.15) * Math.exp((-n * f0) / 5200) * (n === 2 ? 0.8 : 1);
    const Tn = T1 / (1 + 0.5 * (n - 1));
    const rFast = Math.exp(-1 / (Tn * 0.16 * sr));
    const rSlow = Math.exp(-1 / (Tn * sr));
    for (const det of detunes) {
      const w = (2 * Math.PI * fn * det) / sr;
      const c2 = 2 * Math.cos(w);
      let s1 = Math.sin(-w);
      let s2 = Math.sin(-2 * w);
      let eF = 0.62;
      let eS = 0.38;
      const a = amp * 0.5;
      for (let i = 0; i < N; i++) {
        const sv = c2 * s1 - s2;
        s2 = s1;
        s1 = sv;
        out[i] += a * sv * (eF + eS);
        eF *= rFast;
        eS *= rSlow;
      }
    }
  }

  // Hammer: short, low-passed noise thump, brighter for high notes
  const hammerLen = Math.floor(sr * 0.012);
  let y = 0;
  const kH = clamp(f0 / 3000, 0.05, 0.6);
  for (let i = 0; i < hammerLen; i++) {
    y += kH * (Math.random() * 2 - 1 - y);
    out[i] += y * 0.25 * (1 - i / hammerLen);
  }
  // 2 ms attack ramp avoids clicks
  const atk = Math.floor(sr * 0.002);
  for (let i = 0; i < atk; i++) out[i] *= i / atk;

  normalize(out, 0.7);
  fadeTail(out, sr, 0.12);
  return buf;
}
