import type { InstrumentState, SongState } from '../core/types';
import type { Instrument } from '../instruments/Instrument';

const STORAGE_KEY = 'neon-band/song-v1';

export function defaultSong(band: Instrument[]): SongState {
  const instruments: Record<string, InstrumentState> = {};
  for (const inst of band) {
    instruments[inst.id] = {
      volume: inst.defaultVolume,
      muted: false,
      autoEnabled: false,
      startStep: 0,
      automation: inst.defaultAutomation(),
      settings: inst.defaultSettings(),
    };
  }
  return { version: 1, title: 'Untitled jam', bpm: 96, swing: 0, masterVolume: 0.85, key: { root: 0, mode: 'major' }, instruments };
}

/** Combine a loaded song with defaults, so old saves keep working when instruments/settings are added. */
export function mergeSong(defaults: SongState, loaded: unknown): SongState {
  if (!loaded || typeof loaded !== 'object' || (loaded as SongState).version !== 1) return defaults;
  const l = loaded as SongState;
  const instruments: Record<string, InstrumentState> = {};
  for (const [id, def] of Object.entries(defaults.instruments)) {
    const li = l.instruments?.[id];
    instruments[id] = li
      ? {
          ...def,
          ...li,
          startStep: 0,
          automation: li.automation && typeof li.automation === 'object' ? { ...(def.automation as object), ...(li.automation as object) } : def.automation,
          settings: { ...(def.settings as object), ...(li.settings as object) },
        }
      : def;
  }
  return {
    ...defaults,
    title: typeof l.title === 'string' ? l.title : defaults.title,
    bpm: Number(l.bpm) || defaults.bpm,
    swing: Number(l.swing) || 0,
    masterVolume: typeof l.masterVolume === 'number' ? l.masterVolume : defaults.masterVolume,
    key: l.key ?? defaults.key,
    instruments,
  };
}

export function loadSaved(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSong(song: SongState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
  } catch {
    /* storage unavailable: autosave is optional */
  }
}
