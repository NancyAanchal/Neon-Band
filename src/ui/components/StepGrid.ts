import { clear, h } from '../dom';

export interface StepRow {
  id: string;
  label: string;
  cells: string;
}

export interface StepGridOptions {
  steps: number;
  rows: StepRow[];
  /** How to draw a cell's symbol. */
  glyph: (ch: string, rowId: string) => string;
  onCell: (rowId: string, index: number) => void;
  /** Optional: preview a row's sound when its label is clicked. */
  onLabel?: (rowId: string) => void;
}

/** A 16-step grid (drum machine / strum pattern). Beats are visually grouped by four. */
export function stepGrid(o: StepGridOptions) {
  const el = h('div', { class: 'step-grid', style: { '--steps': String(o.steps) } });
  let playhead: number | null = null;
  let rows = o.rows;

  const render = () => {
    clear(el);
    for (const row of rows) {
      const r = h('div', { class: 'step-row' });
      r.append(
        h('button', { type: 'button', class: 'step-label', onClick: () => o.onLabel?.(row.id), tabindex: o.onLabel ? 0 : -1 }, row.label),
      );
      for (let i = 0; i < o.steps; i++) {
        const ch = row.cells[i] ?? '-';
        r.append(
          h(
            'button',
            {
              type: 'button',
              class: 'step' + (ch !== '-' ? ' on' : '') + (ch === 'X' ? ' accent' : '') + (ch === 'g' ? ' ghost' : '') + (i % 4 === 0 ? ' beat' : '') + (i === playhead ? ' now' : ''),
              'data-i': i,
              'aria-label': `${row.label} step ${i + 1}`,
              onClick: () => o.onCell(row.id, i),
            },
            o.glyph(ch, row.id),
          ),
        );
      }
      el.append(r);
    }
  };
  render();

  return {
    el,
    update(next: StepRow[]) {
      rows = next;
      render();
    },
    setPlayhead(i: number | null) {
      if (i === playhead) return;
      playhead = i;
      el.querySelectorAll<HTMLElement>('.step').forEach((c) => c.classList.toggle('now', Number(c.dataset.i) === i));
    },
  };
}

/** Replace one character of a pattern string. */
export function setCell(cells: string, i: number, ch: string, len: number): string {
  const arr = cells.padEnd(len, '-').slice(0, len).split('');
  arr[i] = ch;
  return arr.join('');
}
