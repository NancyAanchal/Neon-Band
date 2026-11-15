import { EventBus } from './EventBus';
import type { Action, InstrumentState, SongState } from './types';

type StoreEvents = { change: { action: Action; state: SongState } };

/** Middleware can inspect, change, block or relay actions (e.g. send them to a server). */
export type Middleware = (action: Action, next: (action: Action) => void) => void;

export class Store {
  readonly events = new EventBus<StoreEvents>();
  private middleware: Middleware[] = [];

  constructor(private _state: SongState) {}

  get state(): SongState {
    return this._state;
  }

  use(mw: Middleware): void {
    this.middleware.push(mw);
  }

  dispatch(action: Action): void {
    const run = (i: number, a: Action): void => {
      if (i < this.middleware.length) this.middleware[i](a, (next) => run(i + 1, next));
      else this.apply(a);
    };
    run(0, action);
  }

  /** Applies an action without running middleware (use for actions that arrive from the network). */
  apply(action: Action): void {
    this._state = reduce(this._state, action);
    this.events.emit('change', { action, state: this._state });
  }
}

function patchInstrument(s: SongState, id: string, patch: Partial<InstrumentState>): SongState {
  const prev = s.instruments[id];
  if (!prev) return s;
  return { ...s, instruments: { ...s.instruments, [id]: { ...prev, ...patch } } };
}

function mapInstruments(s: SongState, fn: (st: InstrumentState) => InstrumentState): SongState {
  const instruments: Record<string, InstrumentState> = {};
  for (const [id, st] of Object.entries(s.instruments)) instruments[id] = fn(st);
  return { ...s, instruments };
}

/** Pure reducer: (state, action) -> new state. Never mutates. */
export function reduce(s: SongState, a: Action): SongState {
  switch (a.type) {
    case 'setBpm':
      return { ...s, bpm: Math.max(40, Math.min(220, Math.round(a.bpm))) };
    case 'setSwing':
      return { ...s, swing: Math.max(0, Math.min(0.5, a.swing)) };
    case 'setMasterVolume':
      return { ...s, masterVolume: Math.max(0, Math.min(1, a.value)) };
    case 'setKey':
      return { ...s, key: a.key };
    case 'setTitle':
      return { ...s, title: a.title };
    case 'setVolume':
      return patchInstrument(s, a.id, { volume: Math.max(0, Math.min(1.2, a.value)) });
    case 'setMuted':
      return patchInstrument(s, a.id, { muted: a.muted });
    case 'setAutomation':
      return patchInstrument(s, a.id, { automation: a.automation });
    case 'setSettings': {
      const prev = s.instruments[a.id];
      if (!prev) return s;
      return patchInstrument(s, a.id, { settings: { ...(prev.settings as object), ...a.patch } });
    }
    case 'setLoop':
      return patchInstrument(s, a.id, { autoEnabled: a.enabled, startStep: a.startStep });
    case 'resetLoopStarts':
      return mapInstruments(s, (st) => ({ ...st, startStep: 0 }));
    case 'stopAllLoops':
      return mapInstruments(s, (st) => ({ ...st, autoEnabled: false }));
    case 'loadSong':
      return a.song;
  }
}
