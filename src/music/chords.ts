import { NOTE_NAMES, SCALES, pc, type Key, type Mode } from './theory';

export interface ChordType {
  id: string;
  suffix: string;
  label: string;
  /** Semitones above the root. */
  intervals: number[];
}

/** Add a new chord quality here and every instrument can play it. */
export const CHORD_TYPES: ChordType[] = [
  { id: 'maj', suffix: '', label: 'Major', intervals: [0, 4, 7] },
  { id: 'min', suffix: 'm', label: 'Minor', intervals: [0, 3, 7] },
  { id: '7', suffix: '7', label: 'Dominant 7', intervals: [0, 4, 7, 10] },
  { id: 'maj7', suffix: 'maj7', label: 'Major 7', intervals: [0, 4, 7, 11] },
  { id: 'm7', suffix: 'm7', label: 'Minor 7', intervals: [0, 3, 7, 10] },
  { id: 'sus2', suffix: 'sus2', label: 'Sus 2', intervals: [0, 2, 7] },
  { id: 'sus4', suffix: 'sus4', label: 'Sus 4', intervals: [0, 5, 7] },
  { id: 'add9', suffix: 'add9', label: 'Add 9', intervals: [0, 4, 7, 14] },
  { id: '6', suffix: '6', label: 'Major 6', intervals: [0, 4, 7, 9] },
  { id: 'm6', suffix: 'm6', label: 'Minor 6', intervals: [0, 3, 7, 9] },
  { id: '9', suffix: '9', label: 'Dominant 9', intervals: [0, 4, 7, 10, 14] },
  { id: 'dim', suffix: 'dim', label: 'Diminished', intervals: [0, 3, 6] },
  { id: 'dim7', suffix: 'dim7', label: 'Diminished 7', intervals: [0, 3, 6, 9] },
  { id: 'm7b5', suffix: 'm7b5', label: 'Half-diminished', intervals: [0, 3, 6, 10] },
  { id: 'aug', suffix: 'aug', label: 'Augmented', intervals: [0, 4, 8] },
  { id: '5', suffix: '5', label: 'Power chord', intervals: [0, 7] },
];

const BY_ID = new Map(CHORD_TYPES.map((t) => [t.id, t]));

export interface Chord {
  root: number;
  type: string;
}

export const chordType = (id: string): ChordType => BY_ID.get(id) ?? CHORD_TYPES[0];
export const chordName = (c: Chord): string => NOTE_NAMES[pc(c.root)] + chordType(c.type).suffix;
export const chordIntervals = (c: Chord): number[] => chordType(c.type).intervals;
export const chordPcs = (c: Chord): number[] => [...new Set(chordIntervals(c).map((i) => pc(c.root + i)))];
export const sameChord = (a: Chord | null | undefined, b: Chord | null | undefined): boolean =>
  !!a && !!b && pc(a.root) === pc(b.root) && a.type === b.type;
export const transposeChord = (c: Chord, semis: number): Chord => ({ root: pc(c.root + semis), type: c.type });

/** Third and seventh of a chord, in semitones (used by bass/violin lines). */
export function chordThird(c: Chord): number {
  const iv = chordIntervals(c);
  if (iv.includes(3)) return 3;
  if (iv.includes(4)) return 4;
  if (iv.includes(2)) return 2;
  if (iv.includes(5)) return 5;
  return 7;
}
export function chordFifth(c: Chord): number {
  const iv = chordIntervals(c);
  return iv.find((i) => i === 6 || i === 7 || i === 8) ?? 7;
}
export function chordSeventh(c: Chord): number {
  const iv = chordIntervals(c);
  return iv.find((i) => i === 9 || i === 10 || i === 11) ?? 12;
}

// ---------------------------------------------------------------- Diatonic chords

const MAJOR_QUALITIES = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_QUALITIES = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export interface DiatonicChord {
  degree: number;
  numeral: string;
  chord: Chord;
}

/** The seven chords that "belong" to a key: I ii iii IV V vi vii° (major). */
export function diatonicChords(key: Key): DiatonicChord[] {
  const qualities = key.mode === 'major' ? MAJOR_QUALITIES : MINOR_QUALITIES;
  return SCALES[key.mode].map((iv, i) => {
    const type = qualities[i];
    let numeral = ROMAN[i];
    if (type === 'min' || type === 'dim') numeral = numeral.toLowerCase();
    if (type === 'dim') numeral += '°';
    return { degree: i, numeral, chord: { root: pc(key.root + iv), type } };
  });
}

// ---------------------------------------------------------------- Progressions

export interface ProgressionSlot {
  chord: Chord;
  /** Length in beats (4 beats = one bar in 4/4). */
  beats: number;
}

export interface Progression {
  slots: ProgressionSlot[];
}

export interface ProgressionPreset {
  id: string;
  name: string;
  mode: Mode;
  /** [scale degree 0..6, chord type override or null, beats] */
  steps: [number, string | null, number][];
}

/** Famous progressions. Add your own: degrees are 0-based (0 = I, 4 = V). */
export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  { id: 'pop', name: 'Pop anthem (I–V–vi–IV)', mode: 'major', steps: [[0, null, 4], [4, null, 4], [5, null, 4], [3, null, 4]] },
  { id: 'sensitive', name: 'Sensitive (vi–IV–I–V)', mode: 'major', steps: [[5, null, 4], [3, null, 4], [0, null, 4], [4, null, 4]] },
  { id: 'doowop', name: 'Doo-wop (I–vi–IV–V)', mode: 'major', steps: [[0, null, 4], [5, null, 4], [3, null, 4], [4, null, 4]] },
  { id: 'rock', name: 'Classic rock (I–IV–V–IV)', mode: 'major', steps: [[0, null, 4], [3, null, 4], [4, null, 4], [3, null, 4]] },
  { id: 'jazz', name: 'Jazz turnaround (ii–V–I)', mode: 'major', steps: [[1, 'm7', 4], [4, '7', 4], [0, 'maj7', 8]] },
  {
    id: 'blues',
    name: '12-bar blues',
    mode: 'major',
    steps: [[0, '7', 4], [0, '7', 4], [0, '7', 4], [0, '7', 4], [3, '7', 4], [3, '7', 4], [0, '7', 4], [0, '7', 4], [4, '7', 4], [3, '7', 4], [0, '7', 4], [4, '7', 4]],
  },
  { id: 'canon', name: 'Canon (I–V–vi–iii–IV–I–IV–V)', mode: 'major', steps: [[0, null, 4], [4, null, 4], [5, null, 4], [2, null, 4], [3, null, 4], [0, null, 4], [3, null, 4], [4, null, 4]] },
  { id: 'epic', name: 'Epic minor (i–VI–III–VII)', mode: 'minor', steps: [[0, null, 4], [5, null, 4], [2, null, 4], [6, null, 4]] },
  { id: 'andalusian', name: 'Andalusian (i–VII–VI–V)', mode: 'minor', steps: [[0, null, 4], [6, null, 4], [5, null, 4], [4, 'maj', 4]] },
  { id: 'minorgroove', name: 'Minor groove (i–iv–VII–III)', mode: 'minor', steps: [[0, null, 4], [3, null, 4], [6, null, 4], [2, null, 4]] },
];

/** Turn a preset into real chords in a key (the key's tonic is kept, the preset decides major/minor). */
export function resolvePreset(preset: ProgressionPreset, key: Key): Progression {
  const dia = diatonicChords({ root: key.root, mode: preset.mode });
  return {
    slots: preset.steps.map(([deg, type, beats]) => ({ chord: { root: dia[deg].chord.root, type: type ?? dia[deg].chord.type }, beats })),
  };
}

export const progressionSteps = (p: Progression): number => p.slots.reduce((n, s) => n + s.beats * 4, 0);

export interface ChordPosition {
  chord: Chord;
  next: Chord;
  index: number;
  /** 16th-note step inside the current chord slot */
  stepInSlot: number;
  slotSteps: number;
  /** Is this the last bar of the slot? (good moment for fills / approach notes) */
  lastBarOfSlot: boolean;
}

/** Which chord is playing at a given 16th-note step of a looping progression? */
export function chordAt(p: Progression, localStep: number): ChordPosition | null {
  const total = progressionSteps(p);
  if (!total) return null;
  let s = ((localStep % total) + total) % total;
  for (let i = 0; i < p.slots.length; i++) {
    const len = p.slots[i].beats * 4;
    if (s < len) {
      return {
        chord: p.slots[i].chord,
        next: p.slots[(i + 1) % p.slots.length].chord,
        index: i,
        stepInSlot: s,
        slotSteps: len,
        lastBarOfSlot: s >= len - 16,
      };
    }
    s -= len;
  }
  return null;
}

// ---------------------------------------------------------------- Voicings

/**
 * Close-position voicing of a chord whose average pitch is as near `center` as possible.
 * Passing the previous voicing's center gives smooth voice leading (like a real pianist).
 */
export function closeVoicing(chord: Chord, center: number, maxNotes = 4): number[] {
  let ivs = [...new Set(chordIntervals(chord).map((i) => i % 12))];
  if (ivs.length > maxNotes) ivs = ivs.filter((i) => i !== 7);
  ivs = ivs.slice(0, maxNotes);
  const pcs = ivs.map((i) => pc(chord.root + i));
  let best: number[] = [];
  let bestScore = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const rot = [...pcs.slice(r), ...pcs.slice(0, r)];
    for (let start = Math.round(center) - 12; start <= Math.round(center); start++) {
      if (pc(start) !== rot[0]) continue;
      const notes = [start];
      for (let k = 1; k < rot.length; k++) {
        let n = notes[k - 1] + 1;
        while (pc(n) !== rot[k]) n++;
        notes.push(n);
      }
      const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
      const score = Math.abs(avg - center);
      if (score < bestScore) {
        bestScore = score;
        best = notes;
      }
    }
  }
  return best;
}

export const average = (ns: number[]): number => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

/** The chord's root placed in a register: lowest instance of root >= `low`. */
export function rootIn(chord: Chord, low: number): number {
  let n = low;
  while (pc(n) !== pc(chord.root)) n++;
  return n;
}

/** Chord tone nearest to `target` (within the chord's pitch classes). */
export function nearestChordTone(chord: Chord, target: number): number {
  const pcs = chordPcs(chord);
  for (let d = 0; d < 12; d++) {
    if (pcs.includes(pc(target - d))) return target - d;
    if (pcs.includes(pc(target + d))) return target + d;
  }
  return target;
}
