/**
 * Strum patterns are 16-character strings, one character per 16th note (one bar of 4/4).
 *
 *   D = down strum      U = up strum (top strings)     s = short/choked down strum
 *   x = muted "chuck"   - = rest
 *   B = bass note (root string)   A = alternate bass note
 *   1–6 = pick a single string (guitarist numbering: 6 = low E, 1 = high e)
 */
export interface StrumPattern {
  id: string;
  name: string;
  pattern: string;
}

export const STRUM_PATTERNS: StrumPattern[] = [
  { id: 'quarters', name: 'Steady quarters', pattern: 'D---D---D---D---' },
  { id: 'folk', name: 'Campfire folk', pattern: 'D---D-U---U-D-U-' },
  { id: 'pop8', name: 'Pop eighths', pattern: 'D-U-D-U-D-U-D-U-' },
  { id: 'rock', name: 'Driving rock', pattern: 'D-D-D-D-D-D-D-DU' },
  { id: 'ballad', name: 'Ballad', pattern: 'D-------D---D-U-' },
  { id: 'funk', name: 'Funk sixteenths', pattern: 'D-xU-UxUD-xU-UxU' },
  { id: 'reggae', name: 'Reggae skank', pattern: '----s-------s---' },
  { id: 'ska', name: 'Ska upbeats', pattern: '--s---s---s---s-' },
  { id: 'arp', name: 'Arpeggio', pattern: 'B-4-3-2-1-2-3-4-' },
  { id: 'travis', name: 'Travis picking', pattern: 'B-2-A-3-B-1-A-2-' },
];

export const STRUM_SYMBOLS: { ch: string; label: string; title: string }[] = [
  { ch: 'D', label: '↓', title: 'Down strum' },
  { ch: 'U', label: '↑', title: 'Up strum' },
  { ch: 's', label: '⇣', title: 'Short (choked) strum' },
  { ch: 'x', label: '✕', title: 'Muted chuck' },
  { ch: 'B', label: 'B', title: 'Bass note' },
  { ch: 'A', label: 'A', title: 'Alternate bass note' },
  { ch: '4', label: '4', title: 'D string' },
  { ch: '3', label: '3', title: 'G string' },
  { ch: '2', label: '2', title: 'B string' },
  { ch: '1', label: '1', title: 'High e string' },
  { ch: '-', label: '·', title: 'Rest' },
];

export const strumGlyph = (ch: string): string => (ch === '-' ? '' : STRUM_SYMBOLS.find((s) => s.ch === ch)?.label ?? ch);
