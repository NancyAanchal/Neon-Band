import { h, type Child } from '../dom';

export interface Option<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

/** Row of mutually exclusive buttons. */
export function segmented<T extends string | number>(options: Option<T>[], value: T, onChange: (v: T) => void): HTMLElement & { set(v: T): void } {
  const el = h('div', { class: 'seg', role: 'radiogroup' }) as unknown as HTMLElement & { set(v: T): void };
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        title: o.title,
        onClick: () => {
          el.set(o.value);
          onChange(o.value);
        },
      },
      o.label,
    ),
  );
  el.append(...buttons);
  el.set = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === v)));
  el.set(value);
  return el;
}

export function selectBox<T extends string>(options: Option<T>[], value: T | '', onChange: (v: T) => void, placeholder?: string): HTMLSelectElement {
  const sel = h('select', { class: 'select', onChange: () => onChange(sel.value as T) });
  if (placeholder) sel.append(h('option', { value: '', disabled: true }, placeholder));
  for (const o of options) sel.append(h('option', { value: o.value }, o.label));
  sel.value = value;
  return sel;
}

export function stepper(value: number, min: number, max: number, onChange: (v: number) => void, format: (v: number) => string = String): HTMLElement & { set(v: number): void } {
  let v = value;
  const out = h('output', { class: 'stepper-val' });
  const el = h(
    'div',
    { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'Decrease', onClick: () => change(v - 1) }, '−'),
    out,
    h('button', { type: 'button', 'aria-label': 'Increase', onClick: () => change(v + 1) }, '+'),
  ) as unknown as HTMLElement & { set(v: number): void };
  const change = (n: number) => {
    n = Math.max(min, Math.min(max, n));
    if (n === v) return;
    el.set(n);
    onChange(n);
  };
  el.set = (n: number) => {
    v = n;
    out.textContent = format(n);
  };
  el.set(v);
  return el;
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLButtonElement & { set(v: boolean): void } {
  const b = h(
    'button',
    {
      type: 'button',
      class: 'toggle',
      onClick: () => {
        const v = b.getAttribute('aria-pressed') !== 'true';
        b.set(v);
        onChange(v);
      },
    },
    h('span', { class: 'toggle-dot' }),
    label,
  ) as HTMLButtonElement & { set(v: boolean): void };
  /** Updates the visual state only (does not call onChange). */
  b.set = (v: boolean) => b.setAttribute('aria-pressed', String(v));
  b.set(value);
  return b;
}

export function slider(value: number, min: number, max: number, step: number, onInput: (v: number) => void, label: string): HTMLInputElement {
  const input = h('input', { type: 'range', class: 'slider', min, max, step, value, 'aria-label': label, onInput: () => onInput(Number(input.value)) });
  return input;
}

/** A titled block in a sidebar. */
export function section(title: string, hint: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'side-sec' }, h('h3', {}, title), hint ? h('p', { class: 'hint' }, hint) : null, ...children);
}

/** "label: control" row. */
export function field(label: string, control: Child): HTMLElement {
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}
