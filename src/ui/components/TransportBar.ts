import type { App } from '../../app/App';
import { h, type Disposer } from '../dom';
import { slider } from './controls';

/** Play/stop, beat lights, tempo, swing, metronome and master volume. */
export function transportBar(app: App, d: Disposer, opts: { compact?: boolean } = {}): HTMLElement {
  const { store, transport } = app;

  const playBtn = h('button', { type: 'button', class: 'play-btn', onClick: () => app.togglePlay() });
  const setPlay = (on: boolean) => {
    playBtn.classList.toggle('on', on);
    playBtn.setAttribute('aria-label', on ? 'Stop the band' : 'Play the band');
    playBtn.innerHTML = on ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  };
  setPlay(transport.playing);

  const dots = [0, 1, 2, 3].map(() => h('span', { class: 'beat-dot' }));
  const beat = h('div', { class: 'beats', 'aria-hidden': 'true' }, dots);

  const bpmInput = h('input', {
    type: 'number',
    class: 'bpm-input',
    min: 40,
    max: 220,
    value: store.state.bpm,
    'aria-label': 'Tempo in beats per minute',
    onChange: () => store.dispatch({ type: 'setBpm', bpm: Number(bpmInput.value) || store.state.bpm }),
  });
  const nudge = (n: number) => store.dispatch({ type: 'setBpm', bpm: store.state.bpm + n });
  const bpm = h(
    'div',
    { class: 'bpm' },
    h('button', { type: 'button', 'aria-label': 'Slower', onClick: () => nudge(-2) }, '−'),
    h('label', {}, bpmInput, h('span', {}, 'bpm')),
    h('button', { type: 'button', 'aria-label': 'Faster', onClick: () => nudge(2) }, '+'),
  );

  const metro = h('button', {
    type: 'button',
    class: 'icon-btn',
    title: 'Metronome',
    'aria-label': 'Metronome',
    'aria-pressed': String(app.metronome),
    html: '<svg viewBox="0 0 24 24"><path d="M9 3h6l4 18H5L9 3z M12 14l5-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    onClick: () => {
      app.metronome = !app.metronome;
      metro.setAttribute('aria-pressed', String(app.metronome));
    },
  });

  const swing = slider(store.state.swing, 0, 0.5, 0.01, (v) => store.dispatch({ type: 'setSwing', swing: v }), 'Swing');
  const vol = slider(store.state.masterVolume, 0, 1, 0.01, (v) => store.dispatch({ type: 'setMasterVolume', value: v }), 'Master volume');

  d.add(transport.events.on('state', ({ playing }) => {
    setPlay(playing);
    if (!playing) dots.forEach((x) => x.classList.remove('lit'));
  }));
  d.add(
    transport.events.on('step', ({ step }) => {
      if (step % 4) return;
      const b = (step / 4) % 4;
      dots.forEach((x, i) => x.classList.toggle('lit', i === b));
      dots[b].classList.toggle('one', b === 0);
    }),
  );
  d.add(
    store.events.on('change', () => {
      if (document.activeElement !== bpmInput) bpmInput.value = String(store.state.bpm);
      swing.value = String(store.state.swing);
      vol.value = String(store.state.masterVolume);
    }),
  );

  return h(
    'div',
    { class: 'transport' + (opts.compact ? ' compact' : '') },
    playBtn,
    beat,
    bpm,
    opts.compact ? null : h('label', { class: 'mini-field' }, h('span', {}, 'Swing'), swing),
    metro,
    opts.compact ? null : h('label', { class: 'mini-field' }, h('span', {}, 'Volume'), vol),
  );
}
