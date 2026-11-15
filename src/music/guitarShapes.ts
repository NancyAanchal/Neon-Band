import { chordName, chordPcs, chordType, type Chord } from './chords';
import { pc } from './theory';

/** Standard tuning, low E (6th string) first: E2 A2 D3 G3 B3 E4. */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];

/** One fret number per string (low E first). null = muted string. Frets are relative to the capo. */
export type Shape = (number | null)[];

/**
 * Hand-picked shapes guitarists actually use. Anything not listed here is generated
 * automatically by `generateShape`, so every chord type in every key works.
 */
const KNOWN_SHAPES: Record<string, string> = {
  C: 'x32010', D: 'xx0232', E: '022100', F: '133211', G: '320003', A: 'x02220',
  Cm: 'x35543', Dm: 'xx0231', Em: '022000', Fm: '133111', Gm: '355333', Am: 'x02210', Bm: 'x24432', 'F#m': '244222',
  C7: 'x32310', D7: 'xx0212', E7: '020100', G7: '320001', A7: 'x02020', B7: 'x21202',
  Cmaj7: 'x32000', Dmaj7: 'xx0222', Emaj7: '021100', Fmaj7: 'xx3210', Gmaj7: '320002', Amaj7: 'x02120',
  Dm7: 'xx0211', Em7: '022030', Am7: 'x02010', Bm7: 'x20202',
  Dsus2: 'xx0230', Asus2: 'x02200', Dsus4: 'xx0233', Esus4: '022200', Asus4: 'x02230',
  Cadd9: 'x32030', E5: '022xxx', A5: 'x022xx', D5: 'xx023x', G5: '355xxx',
};

const parseShape = (str: string): Shape => str.split('').map((c) => (c === 'x' ? null : parseInt(c, 10)));

const cache = new Map<string, Shape>();

/** Best guitar shape for a chord (as if there were no capo; the capo then transposes it). */
export function guitarShape(chord: Chord, tuning: number[] = GUITAR_TUNING): Shape {
  const name = chordName(chord);
  const key = name + '|' + tuning.join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  const known = tuning === GUITAR_TUNING ? KNOWN_SHAPES[name] : undefined;
  const shape = known ? parseShape(known) : generateShape(chord, tuning) ?? [null, 0, 2, 2, null, null];
  cache.set(key, shape);
  return shape;
}

/** Searches every playable fingering and scores it like a guitarist would. */
export function generateShape(chord: Chord, tuning: number[]): Shape | null {
  const pcs = chordPcs(chord);
  const set = new Set(pcs);
  const root = pc(chord.root);
  const fifth = pc(chord.root + 7);
  const essential = pcs.length >= 4 ? pcs.filter((p) => p !== fifth) : pcs;
  const isPower = chordType(chord.type).id === '5';
  const minPlayed = pcs.length <= 2 ? 2 : 4;
  let best: Shape | null = null;
  let bestScore = -Infinity;

  for (let w = 0; w <= 10; w++) {
    const options: (number | null)[][] = tuning.map((open) => {
      const o: (number | null)[] = [null];
      if (set.has(pc(open))) o.push(0);
      for (let f = Math.max(1, w); f <= w + 3; f++) if (set.has(pc(open + f))) o.push(f);
      return o;
    });
    const cur: Shape = [];
    const walk = (i: number): void => {
      if (i === tuning.length) {
        const score = scoreShape(cur, tuning, root, essential, fifth, minPlayed, isPower);
        if (score > bestScore) {
          bestScore = score;
          best = [...cur];
        }
        return;
      }
      for (const f of options[i]) {
        cur.push(f);
        walk(i + 1);
        cur.pop();
      }
    };
    walk(0);
  }
  return best;
}

function scoreShape(shape: Shape, tuning: number[], root: number, essential: number[], fifth: number, minPlayed: number, isPower: boolean): number {
  const played = shape.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  if (played.length < minPlayed) return -Infinity;
  // Played strings must be one contiguous block (no muted string in the middle)
  const first = played[0];
  const last = played[played.length - 1];
  if (last - first + 1 !== played.length) return -Infinity;
  // Lowest note must be the root
  if (pc(tuning[first] + (shape[first] as number)) !== root) return -Infinity;
  const notes = played.map((i) => pc(tuning[i] + (shape[i] as number)));
  if (!essential.every((p) => notes.includes(p))) return -Infinity;

  const fretted = played.filter((i) => (shape[i] as number) > 0).map((i) => shape[i] as number);
  const opens = played.length - fretted.length;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const span = maxF - minF;
  if (span > 3) return -Infinity;
  let fingers = fretted.length;
  const atMin = fretted.filter((f) => f === minF).length;
  if (atMin >= 2) {
    const firstBarre = played.find((i) => shape[i] === minF)!;
    const openAbove = played.some((i) => i > firstBarre && shape[i] === 0);
    if (!openAbove) fingers = 1 + fretted.filter((f) => f > minF).length;
  }
  if (fingers > 4) return -Infinity;

  let score = played.length * 10 + opens * 4 - minF * 2.5 - span * 2 - fingers * 3;
  if (notes.includes(fifth)) score += 3;
  if (last !== tuning.length - 1 && !isPower) score -= 6;
  return score;
}

/** The actual MIDI notes a shape produces with a capo. */
export function shapeNotes(shape: Shape, capo: number, tuning: number[] = GUITAR_TUNING): (number | null)[] {
  return shape.map((f, i) => (f === null ? null : tuning[i] + capo + f));
}
