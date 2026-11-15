/** Pitch math. MIDI note numbers everywhere: 60 = middle C (C4), 69 = A4 = 440 Hz. */

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Pitch class 0..11 for any integer. */
export const pc = (n: number): number => ((n % 12) + 12) % 12;

/** Equal temperament, A4 = 440 Hz. This is what makes every instrument perfectly in tune with every other. */
export const midiToFreq = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (freq: number, a4 = 440): number => 69 + 12 * Math.log2(freq / a4);

export const noteName = (midi: number, withOctave = true): string =>
  NOTE_NAMES[pc(Math.round(midi))] + (withOctave ? String(Math.floor(Math.round(midi) / 12) - 1) : '');

/** Display helper: "C#" -> "C♯", "Bbm7" -> "B♭m7". */
export const pretty = (name: string): string => name.replace(/#/g, '♯').replace(/^([A-G])b/, '$1♭');

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type Mode = keyof typeof SCALES;

export interface Key {
  root: number;
  mode: Mode;
}

export const keyName = (k: Key): string => pretty(NOTE_NAMES[pc(k.root)]) + (k.mode === 'major' ? ' major' : ' minor');

export function scalePcs(key: Key): number[] {
  return SCALES[key.mode].map((i) => pc(key.root + i));
}

/** Move `steps` scale degrees from `midi` (which is snapped into the scale first). */
export function scaleStep(midi: number, steps: number, key: Key): number {
  const pcs = scalePcs(key);
  let m = midi;
  while (!pcs.includes(pc(m))) m--;
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    do m += dir;
    while (!pcs.includes(pc(m)));
  }
  return m;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
