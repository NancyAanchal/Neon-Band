import { pc } from '../../music/theory';
import { h } from '../../ui/dom';

const WHITE = [0, 2, 4, 5, 7, 9, 11];

export interface KeyboardOptions {
  low: number;
  high: number;
  color: string;
  labels?: Map<number, string>;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
}

/** Piano keyboard you can click, glissando across, or multi-touch. */
export class KeyboardView {
  readonly el: HTMLElement;
  private keys = new Map<number, HTMLElement>();
  private pointers = new Map<number, number>();

  constructor(private o: KeyboardOptions) {
    this.el = h('div', { class: 'keyboard', style: { '--c': o.color } });
    this.render();
    this.bind();
  }

  setRange(low: number, high: number, labels?: Map<number, string>): void {
    this.o = { ...this.o, low, high, labels };
    this.render();
  }

  private render(): void {
    this.el.replaceChildren();
    this.keys.clear();
    const whites: number[] = [];
    for (let m = this.o.low; m <= this.o.high; m++) if (WHITE.includes(pc(m))) whites.push(m);
    const wPct = 100 / whites.length;
    whites.forEach((m) => {
      const k = h('div', { class: 'key white', 'data-midi': m }, this.o.labels?.get(m) ? h('kbd', {}, this.o.labels.get(m)!) : null, pc(m) === 0 ? h('span', { class: 'key-c' }, `C${Math.floor(m / 12) - 1}`) : null);
      this.keys.set(m, k);
      this.el.append(k);
    });
    for (let m = this.o.low; m <= this.o.high; m++) {
      if (WHITE.includes(pc(m))) continue;
      const idx = whites.indexOf(m - 1);
      if (idx < 0) continue;
      const k = h('div', { class: 'key black', 'data-midi': m, style: { left: `${(idx + 1) * wPct}%`, width: `${wPct * 0.62}%` } }, this.o.labels?.get(m) ? h('kbd', {}, this.o.labels.get(m)!) : null);
      this.keys.set(m, k);
      this.el.append(k);
    }
  }

  press(midi: number, on: boolean): void {
    this.keys.get(midi)?.classList.toggle('down', on);
  }

  private midiAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.key');
    if (!el || !this.el.contains(el)) return null;
    return Number(el.dataset.midi);
  }

  private bind(): void {
    this.el.addEventListener('pointerdown', (e) => {
      const m = this.midiAt(e.clientX, e.clientY);
      if (m === null) return;
      this.el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, m);
      this.o.onDown(m);
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (prev === undefined) return;
      const m = this.midiAt(e.clientX, e.clientY);
      if (m === null || m === prev) return;
      this.o.onUp(prev);
      this.o.onDown(m);
      this.pointers.set(e.pointerId, m);
    });
    const up = (e: PointerEvent) => {
      const prev = this.pointers.get(e.pointerId);
      if (prev === undefined) return;
      this.o.onUp(prev);
      this.pointers.delete(e.pointerId);
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
  }
}

/** Computer keyboard layout like a piano: A W S E D F T G Y H U J K O L P ; ' */
export const KEY_LAYOUT = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];
