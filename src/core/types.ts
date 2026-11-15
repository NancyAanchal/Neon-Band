import type { Key } from '../music/theory';

/** Per-instrument song data. `A` = automation (loop) data, `S` = instrument settings. */
export interface InstrumentState<A = unknown, S = unknown> {
  volume: number;
  muted: boolean;
  /** Is this instrument's loop playing in the band? */
  autoEnabled: boolean;
  /** Global transport step where its loop started (loops start on bar lines). */
  startStep: number;
  automation: A;
  settings: S;
}

/** Everything needed to recreate a song. Plain JSON: save it, load it, send it over a network. */
export interface SongState {
  version: 1;
  title: string;
  bpm: number;
  /** 0 = straight, 0.5 = heavy swing on 16ths */
  swing: number;
  masterVolume: number;
  key: Key;
  instruments: Record<string, InstrumentState>;
}

/**
 * Every change to the song goes through one of these actions.
 * Because they are plain objects, they can later be relayed to other players (multiplayer).
 */
export type Action =
  | { type: 'setBpm'; bpm: number }
  | { type: 'setSwing'; swing: number }
  | { type: 'setMasterVolume'; value: number }
  | { type: 'setKey'; key: Key }
  | { type: 'setTitle'; title: string }
  | { type: 'setVolume'; id: string; value: number }
  | { type: 'setMuted'; id: string; muted: boolean }
  | { type: 'setAutomation'; id: string; automation: unknown }
  | { type: 'setSettings'; id: string; patch: Record<string, unknown> }
  | { type: 'setLoop'; id: string; enabled: boolean; startStep: number }
  | { type: 'resetLoopStarts' }
  | { type: 'stopAllLoops' }
  | { type: 'loadSong'; song: SongState };
