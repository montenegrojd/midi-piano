import { groupIntoChords } from "./comparison";
import { generateDrillPattern, tapIntervalMs } from "./drillPattern";
import type { DrillPattern, NoteEvent } from "./types";

const TOLERANCE_FRACTION = 0.35; // of one tap interval — keeps hit windows from ever overlapping (< 0.5)

export interface DrillBeatResult {
  beatMs: number;
  tapMs: number | null;
  deviationMs: number | null;
  status: "hit" | "missed";
  score: number; // 0-1
}

export interface DrillGradingResult {
  accuracyPct: number;
  avgDeviationMs: number; // over hit beats only
  avgDeviationPct: number; // avgDeviationMs as a % of the tap interval — comparable across tempos/subdivisions
  netDeviationPct: number; // signed: positive = tapping late (behind), negative = early (ahead), as a % of the tap interval
  hits: number;
  missed: number;
  extra: number;
  toleranceMs: number;
  beats: DrillBeatResult[];
  extraTapMs: number[];
}

/**
 * Grades a drill take by nearest-neighbor time-matching against the generated pattern — not the
 * pitch-based alignment in lib/comparison.ts, which would carry no timing signal here (every tap
 * shares the same dummy pitch). Pattern and take share one absolute clock by construction (both
 * start at the click's count-in end), so a tap's onTime is directly comparable to a beat's.
 */
export function gradeDrillTake(pattern: DrillPattern, takeEvents: NoteEvent[]): DrillGradingResult {
  const referenceBeats = generateDrillPattern(pattern);
  const toleranceMs = tapIntervalMs(pattern) * TOLERANCE_FRACTION;

  // Coalesce near-simultaneous key presses (e.g. a two-hand chord marking one beat) into one tap.
  const taps = groupIntoChords(takeEvents, 60).map((c) => c.anchorTime);
  const claimed = new Array(taps.length).fill(false);

  const beats: DrillBeatResult[] = referenceBeats.map((ref) => {
    let bestIdx = -1;
    let bestDist = Infinity;
    taps.forEach((tapMs, i) => {
      if (claimed[i]) return;
      const dist = Math.abs(tapMs - ref.onTime);
      if (dist <= toleranceMs && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    if (bestIdx === -1) return { beatMs: ref.onTime, tapMs: null, deviationMs: null, status: "missed", score: 0 };
    claimed[bestIdx] = true;
    const deviationMs = taps[bestIdx] - ref.onTime;
    return { beatMs: ref.onTime, tapMs: taps[bestIdx], deviationMs, status: "hit", score: 1 - Math.abs(deviationMs) / toleranceMs };
  });

  const extraTapMs = taps.filter((_, i) => !claimed[i]);
  const hits = beats.filter((b) => b.status === "hit");
  const missed = beats.length - hits.length;
  const scoreSum = hits.reduce((a, b) => a + b.score, 0);
  const accuracyPct = beats.length + extraTapMs.length > 0 ? Math.round((100 * scoreSum) / (beats.length + extraTapMs.length)) : 0;
  const avgDeviationMs = hits.length ? hits.reduce((a, b) => a + Math.abs(b.deviationMs!), 0) / hits.length : 0;

  const netDeviationMs = hits.length ? hits.reduce((a, b) => a + b.deviationMs!, 0) / hits.length : 0;

  return {
    accuracyPct,
    avgDeviationMs,
    avgDeviationPct: Math.round((avgDeviationMs / tapIntervalMs(pattern)) * 1000) / 10,
    netDeviationPct: Math.round((netDeviationMs / tapIntervalMs(pattern)) * 1000) / 10,
    hits: hits.length,
    missed,
    extra: extraTapMs.length,
    toleranceMs,
    beats,
    extraTapMs,
  };
}
