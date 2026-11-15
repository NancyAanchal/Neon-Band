import type { App, Screen } from '../../app/App';
import type { Draft, Instrument } from '../../instruments/Instrument';
import { transportBar } from '../components/TransportBar';
import { Disposer, h } from '../dom';

type Tab = 'play' | 'loop';

function makeDraft<A>(initial: A, onSet: (a: A) => void): Draft<A> {
  let value = structuredClone(initial);
  const listeners = new Set<(a: A) => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((fn) => fn(value));
      onSet(value);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** Close-up of one instrument: the playable instrument on the left, Play / Loop builder sidebar on the right. */
export function instrumentScreen(app: App, inst: Instrument, initialTab: Tab): Screen {
  const d = new Disposer();
  let panelD = new Disposer();
  let tab: Tab = initialTab;

  // Edits apply instantly if the loop is already playing, so you can tweak it live.
  const draft = makeDraft(inst.state.automation, (a) => {
    if (inst.isLooping) app.store.dispatch({ type: 'setAutomation', id: inst.id, automation: a });
  });

  const back = () => app.showRoom(stage.getBoundingClientRect());
  const status = h('span', { class: 'status' });
  const stage = h('div', { class: 'inst-stage' });
  const scroll = h('div', { class: 'side-scroll' });
  const footer = h('div', { class: 'side-footer' });
  const tabPlay = h('button', { type: 'button', role: 'tab', onClick: () => setTab('play') }, 'Play');
  const tabLoop = h('button', { type: 'button', role: 'tab', onClick: () => setTab('loop') }, 'Loop builder');

  const send = () => {
    app.startLoop(inst.id, draft.get());
    back();
  };

  const renderFooter = () => {
    footer.replaceChildren();
    if (tab !== 'loop') {
      footer.hidden = true;
      return;
    }
    footer.hidden = false;
    if (inst.isLooping) {
      footer.append(
        h('button', { type: 'button', class: 'btn ghost', onClick: () => app.stopLoop(inst.id) }, 'Stop loop'),
        h('button', { type: 'button', class: 'btn primary', onClick: back }, 'Back to the band ', h('kbd', {}, '⏎')),
      );
      footer.append(h('p', { class: 'hint footer-hint' }, 'This loop is playing. Changes are heard right away.'));
    } else {
      footer.append(
        h('button', { type: 'button', class: 'btn', onClick: () => app.startLoop(inst.id, draft.get()) }, 'Loop it here'),
        h('button', { type: 'button', class: 'btn primary', onClick: send }, 'Send to the band ', h('kbd', {}, '⏎')),
      );
    }
  };

  const setTab = (t: Tab) => {
    tab = t;
    panelD.dispose();
    panelD = new Disposer();
    scroll.replaceChildren();
    tabPlay.setAttribute('aria-selected', String(t === 'play'));
    tabLoop.setAttribute('aria-selected', String(t === 'loop'));
    if (t === 'play') inst.mountPlayPanel({ el: scroll, d: panelD });
    else inst.mountAutoPanel({ el: scroll, d: panelD }, draft);
    scroll.scrollTop = 0;
    renderFooter();
  };

  const refreshStatus = () => {
    status.textContent = inst.isLooping ? 'Looping' : 'Live';
    status.classList.toggle('on', inst.isLooping);
  };

  const el = h(
    'div',
    { class: 'inst-screen', style: { '--c': inst.color } },
    h(
      'header',
      { class: 'inst-header' },
      h('button', { type: 'button', class: 'btn ghost back', onClick: back, 'aria-label': 'Back to the room' }, '‹ Room'),
      h('h1', { class: 'inst-title neon-sign' }, inst.name),
      status,
      transportBar(app, d, { compact: true }),
    ),
    h('div', { class: 'inst-body' }, stage, h('aside', { class: 'inst-side' }, h('div', { class: 'tabs', role: 'tablist' }, tabPlay, tabLoop), scroll, footer)),
  );

  inst.mountStage({ el: stage, d });
  setTab(initialTab);
  refreshStatus();
  d.add(
    app.store.events.on('change', ({ action }) => {
      if ('id' in action && action.id !== inst.id) return;
      refreshStatus();
      if (action.type === 'setLoop' || action.type === 'stopAllLoops' || action.type === 'loadSong') renderFooter();
    }),
  );

  return {
    el,
    dispose: () => {
      panelD.dispose();
      d.dispose();
    },
    onKey: (e, down) => {
      if (down && e.key === 'Escape') {
        back();
        return true;
      }
      if (down && e.key === 'Enter' && tab === 'loop' && !e.repeat) {
        if (inst.isLooping) back();
        else send();
        return true;
      }
      return inst.onKey(e, down);
    },
  };
}
