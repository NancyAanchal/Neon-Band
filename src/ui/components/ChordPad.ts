import type { Store } from '../../core/Store';
import { CHORD_TYPES, chordName, diatonicChords, sameChord, type Chord } from '../../music/chords';
import { NOTE_NAMES, pc, pretty, type Mode } from '../../music/theory';
import { clear, h, type Disposer } from '../dom';
import { segmented, selectBox } from './controls';

export interface ChordPadOptions {
  store: Store;
  d: Disposer;
  onChord: (chord: Chord) => void;
  /** Small text under a chord name (e.g. what it sounds as with a capo). */
  sub?: (chord: Chord) => string | null;
  /** Show 1–7 keyboard hints. */
  hotkeys?: boolean;
  compact?: boolean;
}

export interface ChordPadHandle {
  el: HTMLElement;
  setActive(chord: Chord | null): void;
  refresh(): void;
}

/**
 * Key picker + the seven chords of that key + every chord type for every root.
 * Used by all chord instruments, in both the Play and Loop builder tabs.
 */
export function chordPad(o: ChordPadOptions): ChordPadHandle {
  const { store } = o;
  let active: Chord | null = null;
  let selRoot = store.state.key.root;
  let selType = 'maj';

  const rootSel = selectBox(
    NOTE_NAMES.map((n, i) => ({ value: String(i), label: pretty(n) })),
    String(store.state.key.root),
    (v) => store.dispatch({ type: 'setKey', key: { ...store.state.key, root: Number(v) } }),
  );
  rootSel.setAttribute('aria-label', 'Key');
  const modeSeg = segmented<Mode>(
    [
      { value: 'major', label: 'Major' },
      { value: 'minor', label: 'Minor' },
    ],
    store.state.key.mode,
    (m) => store.dispatch({ type: 'setKey', key: { ...store.state.key, mode: m } }),
  );

  const diatonic = h('div', { class: 'chord-grid' });
  const roots = h('div', { class: 'root-grid' });
  const types = h('div', { class: 'type-grid' });

  const chordButton = (c: Chord, numeral: string | null, hotkey: string | null) => {
    const sub = o.sub?.(c);
    return h(
      'button',
      { type: 'button', class: 'chord-btn', 'data-chord': chordName(c), onClick: () => o.onChord(c) },
      numeral ? h('span', { class: 'chord-num' }, numeral) : null,
      h('span', { class: 'chord-name' }, pretty(chordName(c))),
      sub ? h('span', { class: 'chord-sub' }, sub) : null,
      hotkey && o.hotkeys ? h('kbd', {}, hotkey) : null,
    );
  };

  const renderDiatonic = () => {
    clear(diatonic);
    diatonicChords(store.state.key).forEach((dc, i) => diatonic.append(chordButton(dc.chord, dc.numeral, String(i + 1))));
    markActive();
  };

  const renderBuilder = () => {
    clear(roots);
    clear(types);
    NOTE_NAMES.forEach((n, i) =>
      roots.append(
        h(
          'button',
          {
            type: 'button',
            class: 'mini-btn',
            'aria-pressed': String(i === selRoot),
            onClick: () => {
              selRoot = i;
              renderBuilder();
              o.onChord({ root: selRoot, type: selType });
            },
          },
          pretty(n),
        ),
      ),
    );
    CHORD_TYPES.forEach((t) =>
      types.append(
        h(
          'button',
          {
            type: 'button',
            class: 'mini-btn',
            title: t.label,
            'aria-pressed': String(t.id === selType),
            onClick: () => {
              selType = t.id;
              renderBuilder();
              o.onChord({ root: selRoot, type: selType });
            },
          },
          pretty(NOTE_NAMES[pc(selRoot)] + t.suffix),
        ),
      ),
    );
  };

  const markActive = () => {
    diatonic.querySelectorAll<HTMLElement>('.chord-btn').forEach((b) => b.classList.toggle('active', !!active && b.dataset.chord === chordName(active)));
  };

  o.d.add(
    store.events.on('change', ({ action }) => {
      if (action.type === 'setKey' || action.type === 'loadSong') {
        rootSel.value = String(store.state.key.root);
        modeSeg.set(store.state.key.mode);
        renderDiatonic();
      }
    }),
  );

  renderDiatonic();
  renderBuilder();

  const el = h(
    'div',
    { class: 'chord-pad' + (o.compact ? ' compact' : '') },
    h('div', { class: 'key-row' }, h('span', { class: 'field-label' }, 'Key'), rootSel, modeSeg),
    diatonic,
    h('details', { class: 'more-chords' }, h('summary', {}, 'All chords'), h('p', { class: 'hint' }, 'Pick a root, then a chord type.'), roots, types),
  );

  return {
    el,
    setActive(c) {
      if (sameChord(c, active) || (!c && !active)) return;
      active = c;
      markActive();
    },
    refresh: renderDiatonic,
  };
}
