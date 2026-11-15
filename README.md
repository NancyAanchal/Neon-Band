# Neon Band

A band in a neon-lit room: guitar, bass, drums, piano and violin. Play each one by hand,
build loops for them, and stack the loops into a song. Every sound is synthesized live in
the browser (no sample files), tuned to exact equal temperament (A4 = 440 Hz).

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev          # opens a local dev server with hot reload
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build in `dist/` (host it on any static site host) |
| `npm run build:single` | One self-contained `dist-single/index.html` you can share or double-click |
| `npm run typecheck` | Check types without building |

## How to play

- **Room:** click an instrument to walk up to it. `Space` plays/stops the band, `1`–`5` open instruments.
- **Instrument screen:** play the big instrument in the middle. The sidebar has two tabs:
  - **Play** – chord buttons, sounds and settings (capo, tone, sustain…)
  - **Loop builder** – chords, pattern and style for the loop. Press **Enter** (or "Send to the band")
    and the loop starts on the next bar while you go back to the room.
- Editing a loop that is already playing changes it live.
- `1`–`7` play the seven chords of the current key on any chord instrument. `Esc` goes back.
- **Song** button: copy, download or load your song as JSON. It also autosaves in the browser.

| Instrument | Hands-on controls |
| --- | --- |
| Guitar | Click frets to pick, drag across the round area to strum, `↓`/`Space` down strum, `↑` up strum |
| Bass | Click or drag along the strings |
| Drums | Click pieces, or keys: `B` kick, `S` snare, `H` hat, `J` open hat, `T` `Y` `U` toms, `K` crash, `L` ride, `R` rim, `C` clap |
| Piano | Click or glide across keys, `A`…`'` play notes, `Z`/`X` octave, hold `Space` for sustain |
| Violin | Hold a string to bow, slide to change pitch, `A`…`'` play notes |

## Project layout

```
src/
  main.ts                 entry point
  app/
    App.ts                wires everything: audio, transport, store, screens, keyboard
    song.ts               default song, merging old saves, autosave
  core/
    Store.ts              song state + reducer + middleware (the multiplayer hook)
    types.ts              SongState, InstrumentState and every Action
    EventBus.ts           tiny typed pub/sub
  audio/
    AudioEngine.ts        AudioContext, mixer channels, reverb, master bus
    Transport.ts          lookahead scheduler, 16th-note steps
    synth/
      pluck.ts            Karplus-Strong strings with fractional tuning (guitar, bass, pizzicato)
      piano.ts            additive piano with inharmonic partials
      bowed.ts            real-time bowed string (violin)
      drums.ts            all drum voices
      voice.ts            buffer playback + lazy render cache
  music/
    theory.ts             notes, frequencies, scales, keys
    chords.ts             chord types, diatonic chords, progressions, voicings
    guitarShapes.ts       chord shapes: hand-picked + automatic search
  instruments/
    Instrument.ts         base class every instrument extends
    ChordInstrument.ts    base for instruments that follow chords
    registry.ts           the band (add instruments here)
    shared/               Fretboard and KeyboardView components
    guitar/ bass/ piano/ drums/ violin/
  ui/
    dom.ts                h() element helper, Disposer
    components/           ChordPad, ProgressionEditor, StepGrid, TransportBar, controls
    screens/              Splash, RoomScreen, InstrumentScreen
  styles/main.css         all styles; theme tokens at the top
```

## How it fits together

```
Transport (every 16th note) ──► App.onStep ──► instrument.scheduleStep(localStep, time)
                                                     │
UI clicks ──► store.dispatch(action) ──► reducer     ▼
                    │                            synth ──► Channel ──► master ──► speakers
                    └─► change event ──► screens re-render, mixer updates, autosave
```

- **One source of truth.** The whole song is a plain JSON object (`SongState`). Every change
  is an `Action` sent through `store.dispatch`. Nothing else mutates song data.
- **Timing.** `Transport` wakes up every 25 ms and schedules everything in the next ~120 ms at
  exact AudioContext times, so the band stays tight even when the UI is busy.
- **Visuals follow sound.** Instruments call `this.show(time, 'hit', …)`; the event fires when
  that sound is actually heard, so lights match the audio.
- **Loops start on bar lines.** Each instrument stores the global step where its loop began
  (`startStep`), so loops added mid-song land on the downbeat.

## Common edits

**Colours and fonts:** tokens at the top of `src/styles/main.css`. Each instrument's neon
colour is its `color` field.

**Add a chord type:** one line in `CHORD_TYPES` (`src/music/chords.ts`). Every instrument can
play it; the guitar finds a shape automatically. Add a preferred shape to `KNOWN_SHAPES` in
`guitarShapes.ts` if you like.

**Add a chord progression:** add to `PROGRESSION_PRESETS` in `chords.ts`
(scale degrees are 0-based: 0 = I, 4 = V).

**Add a strumming pattern:** `src/instruments/guitar/strumPatterns.ts`. A pattern is 16
characters, one per 16th note: `D` down, `U` up, `s` short, `x` mute, `B` bass note,
`A` alternate bass, `1`–`6` single strings, `-` rest.

**Add a drum groove:** `GROOVES` in `src/instruments/drums/grooves.ts`
(`x` hit, `X` accent, `g` ghost, `-` rest).

**Add a bass groove / piano style / violin style:** `bassStyles.ts`, `pianoStyles.ts`,
`violinStyles.ts` in each instrument folder.

**Change a sound:** guitar tone is `ACOUSTIC` in `GuitarInstrument.ts`, bass is `PROFILES` in
`BassInstrument.ts`, drums are in `audio/synth/drums.ts`.

## Adding a new instrument

1. Create `src/instruments/trumpet/TrumpetInstrument.ts`.
2. Extend `ChordInstrument` (if it follows chords) or `Instrument`, and implement:

```ts
export class TrumpetInstrument extends ChordInstrument<TrumpetAutomation, TrumpetSettings> {
  readonly id = 'trumpet';
  readonly name = 'Trumpet';
  readonly color = '#ff8a3d';
  readonly blurb = 'Brass that cuts through the mix';

  protected buildAudio() { /* create synth nodes, connect to this.channel.input */ }
  defaultSettings() { return { mute: false }; }
  defaultAutomation() { return { progression: { slots: [] }, style: 'stabs' }; }
  roomArt() { return `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor">…</svg>`; }

  previewChord(chord: Chord) { /* play it once */ }
  scheduleStep(localStep: number, time: number, stepDuration: number) { /* loop playback */ }

  mountStage(host: Host) { /* the big playable instrument */ }
  mountPlayPanel(host: Host) { /* sidebar Play tab */ }
  mountAutoPanel(host: Host, draft: Draft<TrumpetAutomation>) {
    this.mountProgressionSection(host, draft); // free chord-progression editor
    /* plus your style controls */
  }
}
```

3. Add it to `BAND` in `src/instruments/registry.ts`.

It now appears in the room, gets a mixer channel and a loop, and is included in save files.
Old saves keep working because `mergeSong` fills in defaults for anything missing.

## Toward multiplayer

The architecture is ready for it:

- All song changes are serializable `Action`s. Add a middleware that sends them to a server
  and applies incoming ones with `store.apply` (which skips middleware, avoiding echo loops):

```ts
store.use((action, next) => {
  socket.send(JSON.stringify(action)); // share with the room
  next(action);                         // apply locally
});
socket.onmessage = (e) => store.apply(JSON.parse(e.data));
```

- Live hand-played notes go straight to the instruments, not through the store. To share
  those, send small `{ instrument, method, args }` messages and call the same methods on
  the other side.
- For shared timing, have one player host the tempo and broadcast the bar number; others
  align their `Transport` to it.
- A good server to start with: a small Node WebSocket server, or a hosted realtime service.

## Notes

- Browsers only allow sound after a click, which is why the first screen has a button.
- Song data is saved under `localStorage['neon-band/song-v1']`.
- Fonts load from Google Fonts; offline it falls back to system fonts.
