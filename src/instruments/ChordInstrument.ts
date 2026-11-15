import { chordAt, diatonicChords, type Chord, type Progression } from '../music/chords';
import { chordPad } from '../ui/components/ChordPad';
import { progressionEditor } from '../ui/components/ProgressionEditor';
import { section } from '../ui/components/controls';
import { Instrument, type Draft, type Host } from './Instrument';

/** Loop data shared by every instrument that follows chords. */
export interface ChordAutomation {
  progression: Progression;
}

/**
 * Base for instruments that play along with a chord progression (guitar, bass, piano, violin…).
 * Gives them the progression editor, chord pad and number-key chord shortcuts for free.
 */
export abstract class ChordInstrument<A extends ChordAutomation, S> extends Instrument<A, S> {
  /** Play a chord once (used when tapping chord buttons). */
  abstract previewChord(chord: Chord): void;

  getProgression(a: A = this.automation): Progression {
    return a.progression;
  }

  withProgression(a: A, p: Progression): A {
    return { ...a, progression: p };
  }

  protected loopChord(localStep: number) {
    return chordAt(this.automation.progression, localStep);
  }

  /** Keys 1–7 = the seven chords of the current key. */
  protected hotkeyChord(e: KeyboardEvent): Chord | null {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 7) return null;
    return diatonicChords(this.ctx.store.state.key)[n - 1].chord;
  }

  /** "Chords in the loop" section: progression list + chord pad that adds to it. */
  protected mountProgressionSection(host: Host, draft: Draft<A>): void {
    const editor = progressionEditor({
      store: this.ctx.store,
      d: host.d,
      selfId: this.id,
      band: this.ctx.band,
      get: () => draft.get().progression,
      set: (p) => draft.set(this.withProgression(draft.get(), p)),
      preview: (c) => this.previewChord(c),
    });
    host.d.add(draft.onChange(() => editor.refresh()));
    host.d.add(
      this.ctx.transport.events.on('step', ({ step }) => {
        const local = this.localStepFor(step);
        const pos = local === null ? null : chordAt(this.automation.progression, local);
        editor.setPlaying(pos ? pos.index : null);
      }),
    );
    const pad = chordPad({
      store: this.ctx.store,
      d: host.d,
      compact: true,
      onChord: (c) => {
        this.previewChord(c);
        const p = draft.get().progression;
        draft.set(this.withProgression(draft.get(), { slots: [...p.slots, { chord: c, beats: 4 }] }));
      },
    });
    host.el.append(
      section('Chords in the loop', 'Each chord lasts the beats shown. Tap the beat count to change it.', editor.el),
      section('Add chords', 'Tap a chord to hear it and add it to the end of the loop.', pad.el),
    );
  }
}
