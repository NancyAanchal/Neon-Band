import { BassInstrument } from './bass/BassInstrument';
import { DrumsInstrument } from './drums/DrumsInstrument';
import { GuitarInstrument } from './guitar/GuitarInstrument';
import type { Instrument, InstrumentContext } from './Instrument';
import { PianoInstrument } from './piano/PianoInstrument';
import { ViolinInstrument } from './violin/ViolinInstrument';

/**
 * The band, in the order they stand on stage (left to right).
 * Add a new instrument class here and it appears everywhere: room, mixer, loops, save files.
 */
export const BAND: (new (ctx: InstrumentContext) => Instrument)[] = [GuitarInstrument, BassInstrument, DrumsInstrument, PianoInstrument, ViolinInstrument];

export function createBand(ctx: InstrumentContext): Instrument[] {
  return BAND.map((C) => new C(ctx));
}
