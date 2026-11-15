/**
 * Bass grooves: one bar of notes, repeated while a chord lasts.
 * deg: R root, 5 fifth, 8 octave, 3 third, 7 seventh, L5 fifth below, A approach note into the next chord.
 * len is in 16th-note steps.
 */
export type BassDegree = 'R' | '5' | '8' | '3' | '7' | 'L5' | 'A' | '6';

export interface BassNote {
  step: number;
  deg: BassDegree;
  len: number;
  vel?: number;
}

export interface BassStyle {
  id: string;
  name: string;
  notes: BassNote[];
}

export const BASS_STYLES: BassStyle[] = [
  { id: 'roots', name: 'Root quarters', notes: [0, 4, 8, 12].map((step) => ({ step, deg: 'R', len: 3 })) },
  { id: 'rock8', name: 'Rock eighths', notes: [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, deg: 'R', len: 2, vel: step % 4 ? 0.75 : 0.95 })) },
  { id: 'rootfifth', name: 'Root and fifth', notes: [{ step: 0, deg: 'R', len: 6 }, { step: 8, deg: '5', len: 6 }] },
  { id: 'country', name: 'Boom-chick', notes: [{ step: 0, deg: 'R', len: 3 }, { step: 8, deg: 'L5', len: 3 }] },
  {
    id: 'disco',
    name: 'Disco octaves',
    notes: [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, deg: (step / 2) % 2 ? '8' : 'R', len: 2 }) as BassNote),
  },
  { id: 'walking', name: 'Walking jazz', notes: [{ step: 0, deg: 'R', len: 4 }, { step: 4, deg: '3', len: 4 }, { step: 8, deg: '5', len: 4 }, { step: 12, deg: 'A', len: 4 }] },
  {
    id: 'funk',
    name: 'Funk',
    notes: [
      { step: 0, deg: 'R', len: 2, vel: 1 },
      { step: 3, deg: 'R', len: 1, vel: 0.55 },
      { step: 6, deg: '8', len: 1, vel: 0.8 },
      { step: 7, deg: 'R', len: 1, vel: 0.6 },
      { step: 10, deg: '7', len: 2, vel: 0.8 },
      { step: 12, deg: '5', len: 1, vel: 0.75 },
      { step: 14, deg: 'A', len: 2, vel: 0.85 },
    ],
  },
  { id: 'reggae', name: 'Reggae', notes: [{ step: 0, deg: 'R', len: 5 }, { step: 6, deg: '5', len: 2 }, { step: 10, deg: '8', len: 2 }, { step: 12, deg: '5', len: 3 }] },
  { id: 'pedal', name: 'Long notes', notes: [{ step: 0, deg: 'R', len: 15 }] },
];
