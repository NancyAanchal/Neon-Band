import type { App, Screen } from '../../app/App';
import type { SongState } from '../../core/types';
import type { Instrument } from '../../instruments/Instrument';
import { mergeSong, defaultSong } from '../../app/song';
import { keyName } from '../../music/theory';
import { slider } from '../components/controls';
import { transportBar } from '../components/TransportBar';
import { Disposer, h, svgFromMarkup } from '../dom';

/** The main room: the whole band on stage. Click an instrument to walk up to it. */
export function roomScreen(app: App): Screen {
  const d = new Disposer();
  const { store } = app;

  const canvas = h('canvas', { class: 'visualizer', 'aria-hidden': 'true' });
  const title = h('input', {
    class: 'song-title',
    value: store.state.title,
    'aria-label': 'Song title',
    spellcheck: 'false',
    onChange: () => store.dispatch({ type: 'setTitle', title: title.value.trim() || 'Untitled jam' }),
  });
  const meta = h('p', { class: 'song-meta' });
  const updateMeta = () => {
    const looping = app.instruments.filter((i) => i.isLooping).length;
    meta.textContent = `${keyName(store.state.key)}, ${store.state.bpm} bpm, ${looping ? `${looping} loop${looping > 1 ? 's' : ''} playing` : 'no loops yet'}`;
  };
  updateMeta();

  const stations = app.instruments.map((inst) => station(app, inst));
  const empty = h('p', { class: 'room-hint' }, 'Walk up to an instrument to play it. Build a loop, send it to the band, then add the next one.');

  const songDialog = buildSongDialog(app);

  const el = h(
    'div',
    { class: 'room' },
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand neon-sign' }, 'Neon Band'),
      transportBar(app, d),
      h(
        'div',
        { class: 'topbar-actions' },
        h('button', { type: 'button', class: 'btn ghost small', onClick: () => store.dispatch({ type: 'stopAllLoops' }) }, 'Stop all loops'),
        h('button', { type: 'button', class: 'btn small', onClick: () => songDialog.open() }, 'Song'),
      ),
    ),
    h('div', { class: 'wall' }, canvas, h('div', { class: 'wall-title' }, title, meta)),
    h('main', { class: 'stage' }, h('div', { class: 'floor', 'aria-hidden': 'true' }), h('div', { class: 'band' }, stations.map((s) => s.el)), empty),
    songDialog.el,
  );

  const refresh = () => {
    stations.forEach((s) => s.refresh());
    updateMeta();
    empty.hidden = app.instruments.some((i) => i.isLooping);
    if (document.activeElement !== title) title.value = store.state.title;
  };
  refresh();
  d.add(store.events.on('change', refresh));

  // Visualizer + per-instrument glow driven by their real audio level
  const analyser = app.engine.analyser;
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const colors = app.instruments.map((i) => i.color);
  d.frame(() => {
    for (const s of stations) s.glow();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    analyser.getByteFrequencyData(freq);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    const bars = Math.max(24, Math.floor(w / 14));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      // Log-spaced bins so bass and treble get equal room
      const bin = Math.floor(Math.pow(i / bars, 2.2) * (freq.length * 0.6)) + 2;
      const v = freq[bin] / 255;
      const bh = Math.max(2, v * hgt * 0.9);
      const c = colors[Math.floor((i / bars) * colors.length)];
      g.fillStyle = c;
      g.globalAlpha = 0.18 + v * 0.7;
      g.shadowColor = c;
      g.shadowBlur = 12 * v;
      g.fillRect(i * bw + bw * 0.22, hgt - bh, bw * 0.56, bh);
    }
    g.globalAlpha = 1;
  });

  return {
    el,
    dispose: () => d.dispose(),
    onKey: (e, down) => {
      if (down && e.code === 'Space' && !e.repeat) {
        app.togglePlay();
        return true;
      }
      if (down && !e.repeat && /^[1-9]$/.test(e.key)) {
        const inst = app.instruments[Number(e.key) - 1];
        if (inst) app.showInstrument(inst.id, { origin: stations[Number(e.key) - 1].el.getBoundingClientRect() });
        return !!inst;
      }
      return false;
    },
  };
}

function station(app: App, inst: Instrument) {
  const { store } = app;
  const art = svgFromMarkup(inst.roomArt());
  const open = (tab: 'play' | 'loop') => app.showInstrument(inst.id, { origin: artBtn.getBoundingClientRect(), tab });
  const artBtn = h('button', { type: 'button', class: 'station-art', 'aria-label': `Play ${inst.name}`, onClick: () => open('play') }, art);
  const status = h('span', { class: 'status' });
  const mute = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': `Mute ${inst.name}`,
    html: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path class="wave" d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    onClick: () => store.dispatch({ type: 'setMuted', id: inst.id, muted: !inst.state.muted }),
  });
  const vol = slider(inst.state.volume, 0, 1.2, 0.01, (v) => store.dispatch({ type: 'setVolume', id: inst.id, value: v }), `${inst.name} volume`);
  const loopBtn = h('button', { type: 'button', class: 'btn small' });
  loopBtn.addEventListener('click', () => (inst.isLooping ? app.stopLoop(inst.id) : open('loop')));

  const el = h(
    'section',
    { class: 'station', style: { '--c': inst.color, '--glow': '0' } },
    artBtn,
    h('h2', { class: 'station-name' }, inst.name),
    h('p', { class: 'station-blurb' }, inst.blurb),
    status,
    h('div', { class: 'station-mix' }, mute, vol),
    loopBtn,
  );

  let smooth = 0;
  return {
    el,
    refresh() {
      const st = inst.state;
      el.classList.toggle('looping', st.autoEnabled);
      el.classList.toggle('muted', st.muted);
      status.textContent = st.autoEnabled ? (st.muted ? 'Looping, muted' : 'Looping') : 'Idle';
      mute.setAttribute('aria-pressed', String(st.muted));
      loopBtn.textContent = st.autoEnabled ? 'Stop loop' : 'Build a loop';
      if (document.activeElement !== vol) vol.value = String(st.volume);
    },
    glow() {
      const level = app.engine.getChannel(inst.id)?.level() ?? 0;
      smooth = Math.max(level * 5, smooth * 0.9);
      el.style.setProperty('--glow', Math.min(1, smooth).toFixed(3));
    },
  };
}

function buildSongDialog(app: App) {
  const { store } = app;
  const text = h('textarea', { class: 'song-json', rows: 10, spellcheck: 'false', 'aria-label': 'Song data' });
  const msg = h('p', { class: 'hint', role: 'status' });
  const dialog = h(
    'dialog',
    { class: 'song-dialog' },
    h('h2', {}, 'Song'),
    h('p', { class: 'hint' }, 'Your song saves automatically in this browser. Copy the song data below to back it up or share it, or paste song data and load it.'),
    text,
    msg,
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(text.value);
              msg.textContent = 'Copied to clipboard.';
            } catch {
              text.select();
              msg.textContent = 'Select all and copy the text above.';
            }
          },
        },
        'Copy',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: () => {
            const blob = new Blob([text.value], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `${store.state.title || 'song'}.json` });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          },
        },
        'Download',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn primary',
          style: { '--c': '#2ee6ff' },
          onClick: () => {
            try {
              const song = mergeSong(defaultSong(app.instruments), JSON.parse(text.value)) as SongState;
              app.stop();
              store.dispatch({ type: 'loadSong', song });
              msg.textContent = 'Song loaded. Press play.';
            } catch {
              msg.textContent = 'That text is not valid song data. Check that you pasted all of it.';
            }
          },
        },
        'Load',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost',
          onClick: () => {
            if (!confirm('Start a new song? The current one will be replaced.')) return;
            app.stop();
            store.dispatch({ type: 'loadSong', song: defaultSong(app.instruments) });
            text.value = JSON.stringify(store.state, null, 2);
            msg.textContent = 'New song started.';
          },
        },
        'New song',
      ),
      h('button', { type: 'button', class: 'btn ghost', onClick: () => dialog.close() }, 'Close'),
    ),
  );
  return {
    el: dialog,
    open() {
      text.value = JSON.stringify(store.state, null, 2);
      msg.textContent = '';
      dialog.showModal();
    },
  };
}
