/** Minimal DOM helpers. No framework: every screen/component is a function that builds elements. */

export type Child = Node | string | number | null | undefined | false | Child[];
export type Attrs = Record<string, unknown>;

/**
 * h('button', { class: 'btn', onClick: fn, style: { '--c': '#f0f' } }, 'Label')
 * - `on*` keys become event listeners
 * - `style` object keys are CSS property names in kebab-case (custom properties allowed)
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, ...children);
  return el;
}

export function setAttrs(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v as Record<string, string>)) (el as HTMLElement).style.setProperty(sk, sv);
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

export function append(el: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, ...c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element: s('circle', { cx: 10, cy: 10, r: 4 }) */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string | null)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) {
    if (c === null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Parse an SVG markup string into an element. */
export function svgFromMarkup(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGSVGElement;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Collects cleanup functions so screens/components can be torn down without leaks. */
export class Disposer {
  private fns: (() => void)[] = [];

  add(fn: () => void): void {
    this.fns.push(fn);
  }

  on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  }

  /** requestAnimationFrame loop that stops automatically on dispose. */
  frame(fn: (t: number) => void): void {
    let id = 0;
    const loop = (t: number) => {
      fn(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    this.add(() => cancelAnimationFrame(id));
  }

  dispose(): void {
    while (this.fns.length) {
      try {
        this.fns.pop()!();
      } catch (e) {
        console.error(e);
      }
    }
  }
}

/** Quick glow/pulse animation on any element (Web Animations API). */
export function pulse(el: Element, color: string, ms = 380): void {
  if (!el.animate) return;
  el.animate(
    [
      { filter: `drop-shadow(0 0 10px ${color}) brightness(1.8)` },
      { filter: 'drop-shadow(0 0 0 transparent) brightness(1)' },
    ],
    { duration: ms, easing: 'ease-out' },
  );
}

/** True if the user is typing in a form field (so global hotkeys should be ignored). */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
