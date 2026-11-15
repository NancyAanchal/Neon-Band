import { DRUM_VOICES, type DrumVoice } from '../../audio/synth/drums';

/** 16 steps per voice: x = hit, X = accent, g = ghost (soft), - = rest. */
export type DrumGrid = Record<DrumVoice, string>;

export interface Groove {
  id: string;
  name: string;
  grid: Partial<DrumGrid>;
}

const EMPTY = '----------------';

export function fullGrid(partial: Partial<DrumGrid>): DrumGrid {
  const g = {} as DrumGrid;
  for (const v of DRUM_VOICES) g[v] = (partial[v] ?? EMPTY).padEnd(16, '-').slice(0, 16);
  return g;
}

export const GROOVES: Groove[] = [
  { id: 'rock', name: 'Rock', grid: { kick: 'X-------X-x-----', snare: '----X-------X---', hihat: 'x-x-x-x-x-x-x-x-' } },
  { id: 'pop', name: 'Pop', grid: { kick: 'X-----x-X-------', snare: '----X-------X---', clap: '----x-------x---', hihat: 'x-xgx-xgx-xgx-xg' } },
  { id: 'punk', name: 'Punk', grid: { kick: 'X---X---X---X---', snare: '--X---X---X---X-', crash: 'x---------------', hihat: 'x-x-x-x-x-x-x-x-' } },
  { id: 'funk', name: 'Funk', grid: { kick: 'X-x---x---x--x--', snare: '----X--g-g--X--g', hihat: 'xxxxxxx-xxxxxxxx', openhat: '-------x--------' } },
  { id: 'disco', name: 'Disco', grid: { kick: 'X---X---X---X---', snare: '----X-------X---', hihat: 'x---x---x---x---', openhat: '--x---x---x---x-' } },
  { id: 'house', name: 'House', grid: { kick: 'X---X---X---X---', clap: '----x-------x---', hihat: 'g-g-g-g-g-g-g-g-', openhat: '--x---x---x---x-' } },
  { id: 'hiphop', name: 'Boom bap', grid: { kick: 'X------x--X-----', snare: '----X-------X---', hihat: 'x-x-x-x-x-x-x-xx' } },
  { id: 'halftime', name: 'Half-time', grid: { kick: 'X-----x---------', snare: '--------X-------', hihat: 'x-x-x-x-x-x-x-x-' } },
  { id: 'ballad', name: 'Ballad', grid: { kick: 'X-------x-------', rim: '----x-------x---', ride: 'x-x-x-x-x-x-x-x-' } },
  { id: 'bossa', name: 'Bossa nova', grid: { kick: 'X--xX--xX--xX--x', rim: 'x--x--x---x--x--', hihat: 'xxxxxxxxxxxxxxxx' } },
  { id: 'reggae', name: 'Reggae one drop', grid: { kick: '--------X-------', rim: '--------x-------', hihat: 'x-x-x-x-x-x-x-x-' } },
  { id: 'jazz', name: 'Jazz ride', grid: { kick: 'g-------g-------', ride: 'X---x-xX---x-x--', hihat: '----x-------x---' } },
];

/** Second half of the bar becomes this fill (first half keeps the groove). */
export const FILL: Partial<DrumGrid> = {
  kick: '--------X-------',
  snare: '--------x-xx----',
  tom1: '------------xx--',
  tom2: '--------------x-',
  tom3: '---------------x',
};
