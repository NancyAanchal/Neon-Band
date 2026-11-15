import type { App, Screen } from '../../app/App';
import { h } from '../dom';

/** Browsers only allow sound after a click, so the first screen is a light switch. */
export function splashScreen(app: App): Screen {
  const sign = h('h1', { class: 'neon-sign big' }, 'Neon Band');
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'btn primary large',
      style: { '--c': '#ff3d9a' },
      onClick: async () => {
        btn.disabled = true;
        await app.engine.resume();
        el.classList.add('lit');
        setTimeout(() => app.showRoom(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100);
      },
    },
    'Turn on the lights',
  );
  const el = h(
    'div',
    { class: 'splash' },
    sign,
    h('p', { class: 'splash-sub' }, 'Five instruments in one room. Play them by hand, build loops, and stack them into a song.'),
    btn,
    h('p', { class: 'hint' }, 'Sound on. Headphones recommended.'),
  );
  return { el, dispose: () => {} };
}
