import type { GridBeat } from "./midiParser";
import type { DrillPattern, NoteEvent } from "./types";

export const DRILL_TAP_PITCH = 60; // dummy pitch for the generated pattern — grading never reads pitch

const SUBDIVISION_MULTIPLIER: Record<DrillPattern["subdivision"], number> = {
  quarter: 1,
  eighth: 2,
  triplet: 3,
  sixteenth: 4,
};

export function subdivisionMultiplier(subdivision: DrillPattern["subdivision"]): number {
  return SUBDIVISION_MULTIPLIER[subdivision];
}

/** ms per beat (a denominator-note, e.g. a quarter note in 4/4) at this pattern's tempo. */
export function beatIntervalMs(pattern: DrillPattern): number {
  return 60000 / pattern.bpm;
}

/** ms per tap (one subdivision unit) — what a metronome click actually ticks at. */
export function tapIntervalMs(pattern: DrillPattern): number {
  return beatIntervalMs(pattern) / subdivisionMultiplier(pattern.subdivision);
}

export function totalDurationMs(pattern: DrillPattern): number {
  return pattern.bars * pattern.timeSignature.numerator * beatIntervalMs(pattern);
}

/**
 * Generates the drill's tap targets — one NoteEvent per subdivision tick, all at DRILL_TAP_PITCH
 * since pitch is never graded. Duration is a fixed short blip; only onTime matters for grading.
 */
export function generateDrillPattern(pattern: DrillPattern): NoteEvent[] {
  const tapMs = tapIntervalMs(pattern);
  const totalTaps = Math.round(totalDurationMs(pattern) / tapMs);
  const events: NoteEvent[] = [];
  for (let i = 0; i < totalTaps; i++) {
    const onTime = i * tapMs;
    events.push({ note: DRILL_TAP_PITCH, onTime, offTime: onTime + Math.min(80, tapMs * 0.5), velocity: 100 });
  }
  return events;
}

/**
 * Bar lines/beat ticks for BarGrid — walked at the time signature's own beat (not the subdivision),
 * so an eighth-note drill still gets a quarter-note bar grid. Mirrors lib/midiParser.ts's beat-grid
 * loop, minus the signature-change case (a drill has one fixed signature throughout).
 */
export function generateDrillBeatGrid(pattern: DrillPattern): GridBeat[] {
  const beatMs = beatIntervalMs(pattern);
  const totalBeats = pattern.bars * pattern.timeSignature.numerator;
  const beats: GridBeat[] = [];
  for (let i = 0; i < totalBeats; i++) {
    const beatInBar = i % pattern.timeSignature.numerator;
    beats.push({ ms: i * beatMs, bar: Math.floor(i / pattern.timeSignature.numerator) + 1, beatInBar: beatInBar + 1 });
  }
  return beats;
}
