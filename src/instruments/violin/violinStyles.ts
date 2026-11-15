/**
 * Loop styles for the violin. Each one decides, step by step, which notes start.
 * See ViolinInstrument.scheduleStep for how they are turned into sound.
 */
export interface ViolinStyle {
  id: string;
  name: string;
  hint: string;
}

export const VIOLIN_STYLES: ViolinStyle[] = [
  { id: 'pad', name: 'Long bowed notes', hint: 'Two-note chords held for each chord. Lush and cinematic.' },
  { id: 'melody', name: 'Lyrical melody', hint: 'A singing melody made from the chords and the key. It repeats with the loop.' },
  { id: 'counter', name: 'Counter-melody', hint: 'Slow half notes that move stepwise against the band.' },
  { id: 'pulse', name: 'Driving eighths', hint: 'Short, accented bow strokes. Great for rock and epic tracks.' },
  { id: 'pizz', name: 'Pizzicato', hint: 'Plucked arpeggios, light and bouncy.' },
];

/** Rhythms for the melody style: [start step, length in steps] within one bar. */
export const MELODY_RHYTHMS: [number, number][][] = [
  [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 6], [6, 2], [8, 4], [12, 4]],
  [[0, 2], [2, 2], [4, 4], [8, 8]],
  [[0, 8], [8, 4], [12, 2], [14, 2]],
  [[0, 3], [3, 3], [6, 2], [8, 8]],
];

/** Small deterministic random generator so a melody is the same every time the loop repeats. */
export function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
