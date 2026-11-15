import { DRUM_LABELS, DRUM_VOICES, DrumSynth, type DrumVoice } from '../../audio/synth/drums';
import { field, section, segmented, selectBox, toggle } from '../../ui/components/controls';
import { setCell, stepGrid } from '../../ui/components/StepGrid';
import { h, s } from '../../ui/dom';
import { Instrument, type Draft, type Host } from '../Instrument';
import { drumsArt } from './art';
import { FILL, GROOVES, fullGrid, type DrumGrid } from './grooves';

export interface DrumsSettings {
  /** Slight random timing/velocity so it feels played by a human. */
  humanize: boolean;
}

export interface DrumsAutomation {
  grooveId: string;
  grid: DrumGrid;
  /** Play a fill every N bars (0 = never). */
  fillEvery: number;
  /** Crash cymbal at the start of the loop and after each fill. */
  crash: boolean;
}

/** Computer keys for each drum. */
export const DRUM_KEYS: Record<DrumVoice, string> = {
  kick: 'b',
  snare: 's',
  rim: 'r',
  clap: 'c',
  hihat: 'h',
  openhat: 'j',
  tom1: 't',
  tom2: 'y',
  tom3: 'u',
  crash: 'k',
  ride: 'l',
};

const VEL: Record<string, number> = { x: 0.85, X: 1, g: 0.38 };

export class DrumsInstrument extends Instrument<DrumsAutomation, DrumsSettings> {
  readonly id = 'drums';
  readonly name = 'Drums';
  readonly color = '#ffb22e';
  readonly blurb = 'A full kit and a step sequencer';
  readonly defaultVolume = 0.85;
  private synth!: DrumSynth;

  protected channelOptions() {
    return { pan: 0, reverb: 0.12 };
  }

  protected buildAudio(): void {
    this.synth = new DrumSynth(this.audio, this.channel.input, this.ctx.engine.noise);
  }

  defaultSettings(): DrumsSettings {
    return { humanize: true };
  }

  defaultAutomation(): DrumsAutomation {
    return { grooveId: 'pop', grid: fullGrid(GROOVES[1].grid), fillEvery: 4, crash: true };
  }

  roomArt(): string {
    return drumsArt;
  }

  hit(voice: DrumVoice, time = this.now, vel = 1): void {
    const human = this.settings.humanize;
    const t = time + (human ? Math.random() * 0.006 : 0);
    const v = vel * (human ? 0.92 + Math.random() * 0.08 : 1);
    this.synth.play(voice, t, v);
    this.show(t, 'hit', { key: voice, velocity: v });
  }

  scheduleStep(localStep: number, time: number): void {
    const a = this.automation;
    const bar = Math.floor(localStep / 16);
    const step = localStep % 16;
    const isFillBar = a.fillEvery > 0 && (bar + 1) % a.fillEvery === 0;
    const useFill = isFillBar && step >= 8;
    const fill = fullGrid(FILL);
    for (const voice of DRUM_VOICES) {
      const ch = (useFill ? fill[voice] : a.grid[voice])[step] ?? '-';
      if (ch !== '-' && VEL[ch]) this.hit(voice, time, VEL[ch]);
    }
    if (a.crash && step === 0 && (bar === 0 || (a.fillEvery > 0 && bar % a.fillEvery === 0))) this.hit('crash', time, 0.85);
  }

  // ------------------------------------------------------------ UI

  mountStage({ el, d }: Host): void {
    const kit = buildKit(this.color, (v) => this.hit(v));
    d.add(
      this.visual.on('hit', ({ key }) => {
        const piece = kit.querySelector<SVGGElement>(`[data-voice="${key}"]`);
        piece?.animate?.(
          [
            { transform: 'scale(1.06)', filter: `drop-shadow(0 0 14px ${this.color}) brightness(1.9)` },
            { transform: 'scale(1)', filter: 'none' },
          ],
          { duration: 260, easing: 'ease-out' },
        );
      }),
    );
    el.append(h('div', { class: 'stage-instrument drum-wrap' }, kit), h('p', { class: 'stage-help' }, 'Click any drum or cymbal. Keys are shown on each piece.'));
  }

  mountPlayPanel({ el }: Host): void {
    const pads = h(
      'div',
      { class: 'pad-grid' },
      DRUM_VOICES.map((v) =>
        h(
          'button',
          {
            type: 'button',
            class: 'pad',
            onPointerdown: (e: PointerEvent) => {
              e.preventDefault();
              this.hit(v);
            },
          },
          h('span', {}, DRUM_LABELS[v]),
          h('kbd', {}, DRUM_KEYS[v].toUpperCase()),
        ),
      ),
    );
    el.append(
      section('Pads', 'Tap pads or press the keys to play live over the band.', pads),
      section('Feel', null, toggle('Humanize timing', this.settings.humanize, (v) => this.updateSettings({ humanize: v }))),
    );
  }

  mountAutoPanel({ el, d }: Host, draft: Draft<DrumsAutomation>): void {
    const groove = selectBox(
      [...GROOVES.map((g) => ({ value: g.id, label: g.name })), { value: 'custom', label: 'Custom' }],
      draft.get().grooveId,
      (id) => {
        const g = GROOVES.find((x) => x.id === id);
        if (g) draft.set({ ...draft.get(), grooveId: g.id, grid: fullGrid(g.grid) });
      },
    );
    const rows = (a: DrumsAutomation) => DRUM_VOICES.map((v) => ({ id: v, label: DRUM_LABELS[v], cells: a.grid[v] }));
    const cycle = ['-', 'x', 'X', 'g'];
    const grid = stepGrid({
      steps: 16,
      rows: rows(draft.get()),
      glyph: (ch) => (ch === 'X' ? '●' : ch === 'g' ? '·' : ch === 'x' ? '•' : ''),
      onLabel: (v) => this.hit(v as DrumVoice),
      onCell: (v, i) => {
        const a = draft.get();
        const voice = v as DrumVoice;
        const cur = a.grid[voice][i] ?? '-';
        const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
        if (next !== '-') this.hit(voice, this.now, VEL[next]);
        draft.set({ ...a, grooveId: 'custom', grid: { ...a.grid, [voice]: setCell(a.grid[voice], i, next, 16) } });
      },
    });
    const fill = segmented<number>(
      [
        { value: 0, label: 'Off' },
        { value: 2, label: '2 bars' },
        { value: 4, label: '4 bars' },
        { value: 8, label: '8 bars' },
      ],
      draft.get().fillEvery,
      (v) => draft.set({ ...draft.get(), fillEvery: v }),
    );
    const crash = toggle('Crash on the downbeat after fills', draft.get().crash, (v) => draft.set({ ...draft.get(), crash: v }));
    d.add(
      draft.onChange((a) => {
        grid.update(rows(a));
        groove.value = a.grooveId;
        fill.set(a.fillEvery);
        crash.set(a.crash);
      }),
    );
    d.add(
      this.ctx.transport.events.on('step', ({ step }) => {
        const local = this.localStepFor(step);
        grid.setPlayhead(local === null ? null : local % 16);
      }),
    );
    el.append(
      section('Groove', null, field('Style', groove)),
      section('Step sequencer', 'Tap a step: hit, then accent, then ghost note, then off. Tap a drum name to hear it.', grid.el),
      section('Fills', 'A tom fill in the second half of the bar.', field('Every', fill), crash),
    );
  }

  onKey(e: KeyboardEvent, down: boolean): boolean {
    if (!down || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    const voice = (Object.keys(DRUM_KEYS) as DrumVoice[]).find((v) => DRUM_KEYS[v] === k);
    if (voice) {
      this.hit(voice);
      return true;
    }
    if (e.code === 'Space') {
      this.hit('kick');
      return true;
    }
    return false;
  }
}

/** The big interactive kit (front view). Each piece is a <g data-voice>. */
function buildKit(color: string, onHit: (v: DrumVoice) => void): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 800 540', class: 'drum-kit', role: 'group', 'aria-label': 'Drum kit' });
  svg.style.setProperty('--c', color);
  const label = (x: number, y: number, voice: DrumVoice) =>
    s('text', { x, y, class: 'kit-label' }, `${DRUM_LABELS[voice]}  `, s('tspan', { class: 'kit-key' }, DRUM_KEYS[voice].toUpperCase()));

  const piece = (voice: DrumVoice, ...children: SVGElement[]) => {
    const g = s('g', { 'data-voice': voice, class: 'kit-piece', tabindex: 0, role: 'button', 'aria-label': DRUM_LABELS[voice] }, ...children);
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onHit(voice);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onHit(voice);
    });
    return g;
  };

  const drum = (cx: number, cy: number, rx: number, ry: number, depth: number) => [
    s('path', { d: `M${cx - rx} ${cy} V${cy + depth} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + depth} V${cy}`, class: 'shell' }),
    s('ellipse', { cx, cy, rx, ry, class: 'head' }),
  ];
  const cymbal = (cx: number, cy: number, rx: number, ry: number, standTo: number) => [
    s('line', { x1: cx, y1: cy, x2: cx, y2: standTo, class: 'stand' }),
    s('ellipse', { cx, cy, rx, ry, class: 'cymbal' }),
    s('ellipse', { cx, cy: cy - 2, rx: rx * 0.12, ry: ry * 0.5, class: 'bell' }),
  ];

  svg.append(
    s('ellipse', { cx: 400, cy: 492, rx: 360, ry: 22, class: 'rug' }),
    piece('crash', ...cymbal(210, 78, 105, 18, 300), label(150, 46, 'crash')),
    piece('ride', ...cymbal(612, 98, 112, 19, 330), label(560, 64, 'ride')),
    piece('kick', s('circle', { cx: 400, cy: 360, r: 125, class: 'head big' }), s('circle', { cx: 400, cy: 360, r: 92, class: 'ring' }), s('circle', { cx: 400, cy: 360, r: 22, class: 'ring' }), label(366, 506, 'kick')),
    piece('tom1', ...drum(318, 196, 62, 20, 58), label(280, 160, 'tom1')),
    piece('tom2', ...drum(484, 196, 66, 21, 62), label(450, 160, 'tom2')),
    piece('tom3', ...drum(640, 330, 90, 26, 110), label(600, 292, 'tom3')),
    piece('snare', ...drum(182, 318, 86, 24, 44), label(140, 282, 'snare')),
    piece('hihat', ...cymbal(76, 206, 72, 12, 300), s('ellipse', { cx: 76, cy: 216, rx: 72, ry: 12, class: 'cymbal' }), label(26, 180, 'hihat')),
    piece('openhat', s('rect', { x: 14, y: 372, width: 116, height: 46, rx: 12, class: 'kit-pad' }), s('text', { x: 72, y: 401, class: 'kit-label mid' }, 'Open hat ', s('tspan', { class: 'kit-key' }, 'J'))),
    piece('clap', s('rect', { x: 14, y: 480, width: 116, height: 46, rx: 12, class: 'kit-pad' }), s('text', { x: 72, y: 509, class: 'kit-label mid' }, 'Clap ', s('tspan', { class: 'kit-key' }, 'C'))),
    piece('rim', s('rect', { x: 14, y: 426, width: 116, height: 46, rx: 12, class: 'kit-pad' }), s('text', { x: 72, y: 455, class: 'kit-label mid' }, 'Rim ', s('tspan', { class: 'kit-key' }, 'R'))),
  );
  return svg;
}
