import { normalizeEvents } from "./timelineUtils";
import type { NoteEvent } from "./types";

export interface ChordGroup {
  anchorTime: number;
  notes: number[]; // sorted pitch values, used for similarity comparisons
  events: NoteEvent[]; // the original note events that make up this chord, kept so alignment results can be mapped back to specific bars on a timeline
}

export type StepType = "matched" | "partial" | "wrong" | "missed" | "extra" | "repeat";

export interface AlignmentStep {
  type: StepType;
  ref: ChordGroup | null;
  played: ChordGroup | null;
}

export interface ComparisonResult {
  accuracyPct: number;
  matched: number;
  partial: number;
  wrong: number;
  missed: number;
  extra: number;
  repeat: number;
  refChordCount: number;
  effectiveRefCount: number;
  steps: AlignmentStep[];
}

/**
 * Groups near-simultaneous notes into chord-events (default 60ms window) so comparison works on
 * "what was played together" rather than individual notes. Ported from the POC's
 * groupIntoChords (midi-keyboard-poc.html).
 */
export function groupIntoChords(events: NoteEvent[], epsilonMs = 60): ChordGroup[] {
  const sorted = [...events].sort((a, b) => a.onTime - b.onTime);
  const chords: ChordGroup[] = [];
  for (const e of sorted) {
    const last = chords[chords.length - 1];
    if (last && e.onTime - last.anchorTime <= epsilonMs) {
      last.notes.push(e.note);
      last.events.push(e);
    } else {
      chords.push({ anchorTime: e.onTime, notes: [e.note], events: [e] });
    }
  }
  chords.forEach((c) => c.notes.sort((a, b) => a - b));
  return chords;
}

export function chordSimilarity(a: ChordGroup, b: ChordGroup): number {
  const setB = new Set(b.notes);
  let matched = 0;
  a.notes.forEach((n) => {
    if (setB.has(n)) matched++;
  });
  return matched / Math.max(a.notes.length, b.notes.length, 1);
}

/**
 * Needleman-Wunsch style sequence alignment between the reference and played chord sequences.
 * Works on pitch order, not absolute timing, since your tempo won't match the reference. Ported
 * from the POC's alignChordSequences.
 */
export function alignChordSequences(ref: ChordGroup[], played: ChordGroup[]): AlignmentStep[] {
  const GAP_COST = 0.8;
  const n = ref.length;
  const m = played.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * GAP_COST;
  for (let j = 1; j <= m; j++) dp[0][j] = j * GAP_COST;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = 1 - chordSimilarity(ref[i - 1], played[j - 1]);
      dp[i][j] = Math.min(dp[i - 1][j - 1] + subCost, dp[i - 1][j] + GAP_COST, dp[i][j - 1] + GAP_COST);
    }
  }

  const steps: AlignmentStep[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const sim = i > 0 && j > 0 ? chordSimilarity(ref[i - 1], played[j - 1]) : -1;
    const subCost = 1 - sim;
    if (i > 0 && j > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + subCost)) < 1e-9) {
      const type: StepType = sim === 1 ? "matched" : sim > 0 ? "partial" : "wrong";
      steps.push({ type, ref: ref[i - 1], played: played[j - 1] });
      i--;
      j--;
    } else if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + GAP_COST)) < 1e-9) {
      steps.push({ type: "missed", ref: ref[i - 1], played: null });
      i--;
    } else {
      steps.push({ type: "extra", ref: null, played: played[j - 1] });
      j--;
    }
  }
  return steps.reverse();
}

/**
 * Method-book pieces often write out a repeated phrase in full rather than using a repeat sign.
 * If you only play that phrase once, the alignment can only credit one occurrence as matched —
 * the other sits there looking "missed" even though nothing was actually skipped. Detects a run
 * of missed reference chords that exactly duplicates a matched run elsewhere, and relabels it so
 * it doesn't count against the score. Mutates `steps` in place. Ported from the POC.
 */
export function annotateRepeats(steps: AlignmentStep[]): void {
  const refSteps = steps.filter((s) => s.ref);
  const sig = (c: ChordGroup) => c.notes.join(",");
  const signatures = refSteps.map((s) => sig(s.ref!));
  const MIN_REPEAT_LEN = 3;

  let i = 0;
  while (i < refSteps.length) {
    if (refSteps[i].type !== "missed") {
      i++;
      continue;
    }
    let j = i;
    while (j < refSteps.length && refSteps[j].type === "missed") j++;
    const runLen = j - i;
    if (runLen >= MIN_REPEAT_LEN) {
      for (let k = 0; k <= signatures.length - runLen; k++) {
        if (k === i) continue;
        let isMatch = true;
        for (let x = 0; x < runLen; x++) {
          if (signatures[k + x] !== signatures[i + x]) {
            isMatch = false;
            break;
          }
        }
        if (!isMatch) continue;
        const foundGood = refSteps.slice(k, k + runLen).every((s) => s.type === "matched" || s.type === "partial");
        if (foundGood) {
          for (let x = 0; x < runLen; x++) refSteps[i + x].type = "repeat";
          break;
        }
      }
    }
    i = j;
  }
}

export function compareTakeToReference(referenceEvents: NoteEvent[], takeEvents: NoteEvent[]): ComparisonResult {
  const refChords = groupIntoChords(referenceEvents);
  const playedChords = groupIntoChords(takeEvents);
  const steps = alignChordSequences(refChords, playedChords);
  annotateRepeats(steps);

  const count = (t: StepType) => steps.filter((s) => s.type === t).length;
  const matched = count("matched");
  const partial = count("partial");
  const wrong = count("wrong");
  const missed = count("missed");
  const extra = count("extra");
  const repeat = count("repeat");
  const effectiveRefCount = refChords.length - repeat;
  const accuracySum = steps.reduce((a, s) => a + (s.ref && s.played ? chordSimilarity(s.ref, s.played) : 0), 0);
  // Extra chords (played but not in the reference) inflate the denominator without adding to the
  // sum, so accuracy reflects both recall (did you play everything asked for) and precision (did
  // you avoid playing things that weren't) rather than recall alone.
  const accuracyDenominator = effectiveRefCount + extra;
  const accuracyPct = accuracyDenominator ? Math.round((accuracySum / accuracyDenominator) * 100) : 0;

  return { accuracyPct, matched, partial, wrong, missed, extra, repeat, refChordCount: refChords.length, effectiveRefCount, steps };
}

/**
 * Maps each original reference/take note event to the alignment status of the chord it belonged
 * to, so a timeline drawn from the same NoteEvent objects can flag exactly which bars were
 * missed/wrong/partial/extra. Keyed by object identity — pass the same event arrays used to
 * build `result` via compareTakeToReference.
 */
export function buildEventStatusMaps(steps: AlignmentStep[]): { refStatus: Map<NoteEvent, StepType>; takeStatus: Map<NoteEvent, StepType> } {
  const refStatus = new Map<NoteEvent, StepType>();
  const takeStatus = new Map<NoteEvent, StepType>();
  for (const s of steps) {
    if (s.ref) for (const e of s.ref.events) refStatus.set(e, s.type);
    if (s.played) for (const e of s.played.events) takeStatus.set(e, s.type);
  }
  return { refStatus, takeStatus };
}

export interface TimingDeviationPoint {
  refFrac: number; // 0-1, position through the reference (by its own duration)
  deviation: number; // takeFrac - refFrac; positive = you were proportionally behind pace here, negative = ahead
}

/**
 * For every matched/partial note pair, compares how far each has progressed through its own
 * normalized timeline (0-1, same normalization as the timeline charts). Since both sides are
 * normalized to their own total duration, an overall tempo difference (playing the whole piece
 * slower or faster) cancels out — what's left is *local* drift relative to the reference's actual
 * rhythm, not a flat metronome grid, which is what makes this meaningful for real pieces with
 * mixed note values rather than just steady-pulse exercises.
 */
export function computeTimingDeviations(steps: AlignmentStep[], referenceEvents: NoteEvent[], takeEvents: NoteEvent[]): TimingDeviationPoint[] {
  const ref = normalizeEvents(referenceEvents);
  const take = normalizeEvents(takeEvents);
  const points: TimingDeviationPoint[] = [];
  for (const s of steps) {
    if ((s.type === "matched" || s.type === "partial") && s.ref && s.played) {
      const refFrac = (s.ref.anchorTime - ref.t0) / ref.total;
      const takeFrac = (s.played.anchorTime - take.t0) / take.total;
      points.push({ refFrac, deviation: takeFrac - refFrac });
    }
  }
  return points;
}
