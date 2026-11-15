import type { Shape } from '../../music/guitarShapes';
import { s } from '../../ui/dom';

export interface FretboardOptions {
  /** Open-string MIDI notes, lowest string first (drawn at the top, like looking down at the instrument). */
  tuning: number[];
  stringLabels: string[];
  frets: number;
  color: string;
  spacing: number;
  /** [thickest, thinnest] string width */
  stringWidths: [number, number];
  /** Show the strum area on the right (guitar). */
  strumZone: boolean;
  getCapo: () => number;
  /** Fret is relative to the capo (0 = open/capo). */
  onPluck: (string: number, fret: number) => void;
  onStrumString?: (string: number, dir: 'down' | 'up') => void;
  onStrumTap?: () => void;
}

const NUT_X = 46;
const BOARD_END = 860;
const TOP = 46;
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

/**
 * Interactive SVG neck. Click/drag over frets to pick notes, drag across the strum area to strum.
 * Fret spacing follows the real rule (each fret is 2^(-1/12) of the previous length).
 */
export class Fretboard {
  readonly el: SVGSVGElement;
  private readonly strings: SVGLineElement[] = [];
  private readonly shapeLayer: SVGGElement;
  private readonly capoLayer: SVGGElement;
  private readonly flashLayer: SVGGElement;
  private readonly width: number;
  private readonly height: number;
  private readonly scale: number;
  private shape: Shape | null = null;
  private mode: 'fret' | 'strum' | null = null;
  private lastCell = '';
  private lastY = 0;
  private moved = false;

  constructor(private readonly o: FretboardOptions) {
    this.width = o.strumZone ? 1100 : BOARD_END + 24;
    this.height = TOP * 2 + (o.tuning.length - 1) * o.spacing;
    this.scale = (BOARD_END - NUT_X) / (1 - Math.pow(2, -o.frets / 12));
    this.el = s('svg', { viewBox: `0 0 ${this.width} ${this.height}`, class: 'fretboard', role: 'img', 'aria-label': 'Fretboard' });
    this.el.style.setProperty('--c', o.color);
    this.shapeLayer = s('g');
    this.capoLayer = s('g');
    this.flashLayer = s('g', { 'pointer-events': 'none' });
    this.render();
    this.bindPointer();
  }

  fretX(n: number): number {
    return NUT_X + this.scale * (1 - Math.pow(2, -n / 12));
  }

  stringY(i: number): number {
    return TOP + i * this.o.spacing;
  }

  private cellCenter(absFret: number): number {
    return absFret === 0 ? NUT_X / 2 : (this.fretX(absFret - 1) + this.fretX(absFret)) / 2;
  }

  private render(): void {
    const { tuning, frets, color } = this.o;
    const n = tuning.length;
    const boardTop = TOP - 18;
    const boardH = (n - 1) * this.o.spacing + 36;
    const midY = TOP + ((n - 1) * this.o.spacing) / 2;

    this.el.append(
      s(
        'defs',
        {},
        s('linearGradient', { id: 'fb-wood', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#1d1236' }), s('stop', { offset: 1, 'stop-color': '#120a24' })),
        s('filter', { id: 'fb-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, s('feGaussianBlur', { stdDeviation: 3.5, result: 'b' }), s('feMerge', {}, s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' }))),
      ),
      s('rect', { x: NUT_X, y: boardTop, width: BOARD_END - NUT_X, height: boardH, rx: 6, fill: 'url(#fb-wood)', stroke: color, 'stroke-opacity': 0.35 }),
    );
    for (const f of INLAYS.filter((f) => f <= frets)) this.el.append(s('circle', { cx: this.cellCenter(f), cy: midY, r: 6, fill: color, opacity: 0.22 }));
    if (frets >= 12) {
      const off = this.o.spacing * (n > 4 ? 1.5 : 1);
      for (const dy of [-off, off]) this.el.append(s('circle', { cx: this.cellCenter(12), cy: midY + dy, r: 6, fill: color, opacity: 0.22 }));
    }
    for (let f = 1; f <= frets; f++) {
      const x = this.fretX(f);
      this.el.append(s('line', { x1: x, y1: boardTop, x2: x, y2: boardTop + boardH, stroke: '#cbbcff', 'stroke-opacity': 0.45, 'stroke-width': 2.2 }));
      if ([3, 5, 7, 9, 12, 15].includes(f)) this.el.append(s('text', { x: this.cellCenter(f), y: boardTop + boardH + 15, class: 'fb-num' }, String(f)));
    }
    this.el.append(s('rect', { x: NUT_X - 6, y: boardTop, width: 6, height: boardH, rx: 2, fill: '#efe8ff', opacity: 0.85 }));

    if (this.o.strumZone) {
      const zx = BOARD_END + 34;
      const zw = this.width - zx - 8;
      this.el.append(
        s('rect', { x: zx, y: boardTop - 8, width: zw, height: boardH + 16, rx: 22, class: 'strum-zone' }),
        s('circle', { cx: zx + zw / 2, cy: midY, r: Math.min(zw, boardH) * 0.42, fill: 'none', stroke: color, 'stroke-opacity': 0.25, 'stroke-width': 2 }),
        s('circle', { cx: zx + zw / 2, cy: midY, r: Math.min(zw, boardH) * 0.34, fill: 'none', stroke: color, 'stroke-opacity': 0.15, 'stroke-width': 6 }),
        s('text', { x: zx + zw / 2, y: boardTop + boardH + 15, class: 'fb-num' }, 'Drag here to strum'),
      );
    }

    const [w0, w1] = this.o.stringWidths;
    const endX = this.o.strumZone ? this.width - 8 : BOARD_END + 16;
    for (let i = 0; i < n; i++) {
      const y = this.stringY(i);
      const w = w0 + ((w1 - w0) * i) / Math.max(1, n - 1);
      const line = s('line', { x1: 4, y1: y, x2: endX, y2: y, class: 'fb-string', 'stroke-width': w });
      line.dataset.w = String(w);
      this.strings.push(line);
      this.el.append(line);
      this.el.append(s('text', { x: 14, y: y - 6, class: 'fb-label' }, this.o.stringLabels[i]));
    }
    this.el.append(this.capoLayer, this.shapeLayer, this.flashLayer);
    this.updateCapo();
  }

  updateCapo(): void {
    const capo = this.o.getCapo();
    this.capoLayer.replaceChildren();
    if (capo > 0) {
      const top = TOP - 24;
      const h = (this.o.tuning.length - 1) * this.o.spacing + 48;
      const x = this.fretX(capo) - 16;
      this.capoLayer.append(
        s('rect', { x: NUT_X, y: top + 6, width: x - NUT_X, height: h - 12, fill: '#07030f', opacity: 0.55 }),
        s('rect', { x, y: top, width: 13, height: h, rx: 6, class: 'capo' }),
        s('text', { x: x + 6, y: top - 4, class: 'fb-num capo-label' }, `Capo ${capo}`),
      );
    }
    this.setShape(this.shape);
  }

  /** Show a chord shape as glowing dots (frets relative to the capo). */
  setShape(shape: Shape | null): void {
    this.shape = shape;
    this.shapeLayer.replaceChildren();
    if (!shape) return;
    const capo = this.o.getCapo();
    shape.forEach((f, i) => {
      const y = this.stringY(i);
      if (f === null) this.shapeLayer.append(s('text', { x: 30, y: y + 5, class: 'fb-mute' }, '×'));
      else if (f === 0) this.shapeLayer.append(s('circle', { cx: 32, cy: y, r: 6, class: 'fb-open' }));
      else this.shapeLayer.append(s('circle', { cx: this.cellCenter(capo + f), cy: y, r: Math.min(12, this.o.spacing * 0.32), class: 'fb-dot', filter: 'url(#fb-glow)' }));
    });
  }

  /** Light up a string (and the fret) that was just played. Fret is absolute (not capo-relative). */
  flash(string: number, absFret: number | null): void {
    const line = this.strings[string];
    if (!line) return;
    const w = Number(line.dataset.w);
    line.animate?.(
      [
        { stroke: this.o.color, strokeWidth: `${w * 2.4}px`, transform: 'translateY(1.2px)' },
        { stroke: this.o.color, strokeWidth: `${w * 1.6}px`, transform: 'translateY(-1px)', offset: 0.2 },
        { stroke: '', strokeWidth: `${w}px`, transform: 'translateY(0)' },
      ],
      { duration: 650, easing: 'ease-out' },
    );
    if (absFret === null) return;
    const dot = s('circle', { cx: this.cellCenter(absFret), cy: this.stringY(string), r: 10, fill: this.o.color, filter: 'url(#fb-glow)' });
    this.flashLayer.append(dot);
    const anim = dot.animate?.([{ opacity: 1, r: '10px' }, { opacity: 0, r: '22px' }], { duration: 500, easing: 'ease-out' });
    if (anim) anim.onfinish = () => dot.remove();
    else setTimeout(() => dot.remove(), 500);
  }

  // ------------------------------------------------------------ input

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const ctm = this.el.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  private cellAt(x: number, y: number): { string: number; fret: number } {
    const n = this.o.tuning.length;
    const string = Math.max(0, Math.min(n - 1, Math.round((y - TOP) / this.o.spacing)));
    let fret = this.o.frets;
    if (x < NUT_X) fret = 0;
    else for (let f = 1; f <= this.o.frets; f++) if (x < this.fretX(f)) { fret = f; break; }
    return { string, fret };
  }

  private pluckCell(x: number, y: number): void {
    const { string, fret } = this.cellAt(x, y);
    const key = `${string}:${fret}`;
    if (key === this.lastCell) return;
    this.lastCell = key;
    const capo = this.o.getCapo();
    this.o.onPluck(string, fret <= capo ? 0 : fret - capo);
  }

  private bindPointer(): void {
    this.el.addEventListener('pointerdown', (e) => {
      const { x, y } = this.toLocal(e);
      this.el.setPointerCapture(e.pointerId);
      if (this.o.strumZone && x > BOARD_END + 20) {
        this.mode = 'strum';
        this.lastY = y;
        this.moved = false;
      } else {
        this.mode = 'fret';
        this.lastCell = '';
        this.pluckCell(x, y);
      }
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!this.mode) return;
      const { x, y } = this.toLocal(e);
      if (this.mode === 'fret') return this.pluckCell(x, y);
      const n = this.o.tuning.length;
      const order = y > this.lastY ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
      for (const i of order) {
        const sy = this.stringY(i);
        if (this.lastY < sy && y >= sy) {
          this.o.onStrumString?.(i, 'down');
          this.moved = true;
        } else if (this.lastY > sy && y <= sy) {
          this.o.onStrumString?.(i, 'up');
          this.moved = true;
        }
      }
      this.lastY = y;
    });
    const end = () => {
      if (this.mode === 'strum' && !this.moved) this.o.onStrumTap?.();
      this.mode = null;
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }
}
