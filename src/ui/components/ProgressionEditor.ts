import type { Store } from '../../core/Store';
import type { Instrument } from '../../instruments/Instrument';
import { PROGRESSION_PRESETS, chordName, progressionSteps, resolvePreset, type Chord, type Progression } from '../../music/chords';
import { pretty } from '../../music/theory';
import { clear, h, type Disposer } from '../dom';
import { selectBox } from './controls';

export interface ProgressionEditorOptions {
  store: Store;
  d: Disposer;
  selfId: string;
  band: () => Instrument[];
  get: () => Progression;
  set: (p: Progression) => void;
  preview: (c: Chord) => void;
}

const BEAT_CYCLE = [4, 8, 2, 1];

/** Editable list of chords in a loop, with presets and "copy from another instrument". */
export function progressionEditor(o: ProgressionEditorOptions) {
  const list = h('ol', { class: 'prog-list' });
  const total = h('span', { class: 'prog-total' });
  let playing: number | null = null;

  const update = (fn: (slots: Progression['slots']) => Progression['slots']) => o.set({ slots: fn([...o.get().slots]) });

  const presetSel = selectBox(
    PROGRESSION_PRESETS.map((p) => ({ value: p.id, label: p.name })),
    '',
    (id) => {
      const preset = PROGRESSION_PRESETS.find((p) => p.id === id);
      if (preset) o.set(resolvePreset(preset, o.store.state.key));
      presetSel.value = '';
    },
    'Use a famous progression…',
  );

  const copySel = h('select', { class: 'select' });
  const fillCopy = () => {
    clear(copySel);
    copySel.append(h('option', { value: '', disabled: true }, 'Copy chords from…'));
    for (const inst of o.band()) {
      if (inst.id === o.selfId) continue;
      const p = inst.getProgression();
      if (p && p.slots.length) copySel.append(h('option', { value: inst.id }, inst.name));
    }
    copySel.value = '';
  };
  copySel.addEventListener('focus', fillCopy);
  copySel.addEventListener('pointerdown', fillCopy);
  copySel.addEventListener('change', () => {
    const src = o.band().find((i) => i.id === copySel.value);
    const p = src?.getProgression();
    if (p) o.set(structuredClone(p));
    copySel.value = '';
  });
  fillCopy();

  const render = () => {
    clear(list);
    const slots = o.get().slots;
    if (!slots.length) {
      list.append(h('li', { class: 'prog-empty' }, 'No chords yet. Add some below, or pick a famous progression.'));
    }
    slots.forEach((slot, i) => {
      list.append(
        h(
          'li',
          { class: 'prog-chip' + (i === playing ? ' playing' : '') },
          h('button', { type: 'button', class: 'prog-name', title: 'Hear this chord', onClick: () => o.preview(slot.chord) }, pretty(chordName(slot.chord))),
          h(
            'button',
            {
              type: 'button',
              class: 'prog-beats',
              title: 'Change length',
              onClick: () =>
                update((s) => {
                  const next = BEAT_CYCLE[(BEAT_CYCLE.indexOf(s[i].beats) + 1) % BEAT_CYCLE.length] ?? 4;
                  s[i] = { ...s[i], beats: next };
                  return s;
                }),
            },
            `${slot.beats} beat${slot.beats === 1 ? '' : 's'}`,
          ),
          h(
            'span',
            { class: 'prog-tools' },
            h('button', { type: 'button', 'aria-label': 'Move earlier', disabled: i === 0, onClick: () => update((s) => (([s[i - 1], s[i]] = [s[i], s[i - 1]]), s)) }, '‹'),
            h('button', { type: 'button', 'aria-label': 'Move later', disabled: i === slots.length - 1, onClick: () => update((s) => (([s[i + 1], s[i]] = [s[i], s[i + 1]]), s)) }, '›'),
            h('button', { type: 'button', 'aria-label': 'Remove', onClick: () => update((s) => (s.splice(i, 1), s)) }, '×'),
          ),
        ),
      );
    });
    const bars = progressionSteps(o.get()) / 16;
    total.textContent = slots.length ? `${Number.isInteger(bars) ? bars : bars.toFixed(2)} bar${bars === 1 ? '' : 's'}, then it repeats` : '';
  };

  render();

  const el = h(
    'div',
    { class: 'prog' },
    list,
    total,
    h('div', { class: 'prog-actions' }, presetSel, copySel, h('button', { type: 'button', class: 'btn ghost small', onClick: () => o.set({ slots: [] }) }, 'Clear')),
  );

  return {
    el,
    refresh: render,
    setPlaying(i: number | null) {
      if (i === playing) return;
      playing = i;
      list.querySelectorAll('.prog-chip').forEach((c, idx) => c.classList.toggle('playing', idx === i));
    },
  };
}
