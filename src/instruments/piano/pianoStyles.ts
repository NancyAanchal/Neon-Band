import type { Chord } from '../../music/chords';

/** One thing the piano plays: notes, how long (16th steps), how hard. */
export interface PianoEvent {
  notes: number[];
  len: number;
  vel: number;
}

export interface PianoStyleContext {
  chord: Chord;
  stepInSlot: number;
  stepInBar: number;
  slotSteps: number;
  /** Right-hand chord voicing (voice-led from the previous chord). */
  rh: number[];
  /** Left-hand bass note. */
  lh: number;
}

export interface PianoStyle {
  id: string;
  name: string;
  /** Return what starts on this step (empty array = nothing). */
  play: (c: PianoStyleContext) => PianoEvent[];
}

const fifth = (c: PianoStyleContext) => c.lh + 7;

export const PIANO_STYLES: PianoStyle[] = [
  {
    id: 'block',
    name: 'Whole chords',
    play: (c) => (c.stepInSlot === 0 ? [{ notes: [c.lh, ...c.rh], len: c.slotSteps, vel: 0.7 }] : []),
  },
  {
    id: 'pulse',
    name: 'Pulsing eighths',
    play: (c) => {
      const ev: PianoEvent[] = [];
      if (c.stepInBar % 2 === 0) ev.push({ notes: c.rh, len: 1.6, vel: c.stepInBar % 4 === 0 ? 0.68 : 0.5 });
      if (c.stepInBar % 8 === 0) ev.push({ notes: [c.lh, c.lh + 12], len: 8, vel: 0.7 });
      return ev;
    },
  },
  {
    id: 'ballad',
    name: 'Ballad',
    play: (c) => {
      const ev: PianoEvent[] = [];
      const lhLine = [c.lh, fifth(c), c.lh + 12, c.rh[0] + 0 > c.lh + 12 ? c.rh[0] : c.lh + 16, c.lh + 12, fifth(c), c.lh + 12, fifth(c)];
      if (c.stepInBar % 2 === 0) ev.push({ notes: [lhLine[c.stepInBar / 2]], len: 6, vel: 0.52 });
      if (c.stepInBar === 0 || c.stepInBar === 8) ev.push({ notes: c.rh, len: 8, vel: 0.62 });
      return ev;
    },
  },
  {
    id: 'arpup',
    name: 'Arpeggio up',
    play: (c) => {
      const seq = [c.lh, fifth(c), ...c.rh, ...c.rh.map((n) => n + 12)];
      return c.stepInBar % 2 === 0 ? [{ notes: [seq[(c.stepInBar / 2) % seq.length]], len: 4, vel: 0.56 }] : [];
    },
  },
  {
    id: 'arpwave',
    name: 'Arpeggio wave',
    play: (c) => {
      const up = [c.lh, fifth(c), ...c.rh, c.rh[0] + 12];
      const seq = [...up, ...up.slice(1, -1).reverse()];
      return [{ notes: [seq[c.stepInBar % seq.length]], len: 3, vel: c.stepInBar % 4 === 0 ? 0.6 : 0.45 }];
    },
  },
  {
    id: 'alberti',
    name: 'Alberti bass',
    play: (c) => {
      const low = [c.lh, c.lh + 7, c.lh + (c.rh.length ? ((c.rh[1] ?? c.rh[0]) - c.lh) % 12 : 4) + 12, c.lh + 7];
      const ev: PianoEvent[] = [];
      if (c.stepInBar % 2 === 0) ev.push({ notes: [low[(c.stepInBar / 2) % 4]], len: 2, vel: 0.45 });
      if (c.stepInBar === 0) ev.push({ notes: c.rh.map((n) => n + 12), len: 16, vel: 0.6 });
      return ev;
    },
  },
  {
    id: 'comp',
    name: 'Jazz comping',
    play: (c) => {
      const ev: PianoEvent[] = [];
      if (c.stepInBar === 0 || c.stepInBar === 8) ev.push({ notes: [c.lh], len: 7, vel: 0.6 });
      if (c.stepInBar === 0) ev.push({ notes: c.rh, len: 3, vel: 0.6 });
      if (c.stepInBar === 6) ev.push({ notes: c.rh, len: 2, vel: 0.55 });
      if (c.stepInBar === 12) ev.push({ notes: c.rh, len: 2, vel: 0.5 });
      return ev;
    },
  },
  {
    id: 'stabs',
    name: 'Offbeat stabs',
    play: (c) => {
      const ev: PianoEvent[] = [];
      if (c.stepInBar % 4 === 2) ev.push({ notes: c.rh, len: 1, vel: 0.62 });
      if (c.stepInBar === 0) ev.push({ notes: [c.lh], len: 4, vel: 0.6 });
      return ev;
    },
  },
];
