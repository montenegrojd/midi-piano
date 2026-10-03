import { chordSimilarity, type ChordGroup, type ComparisonResult } from "./comparison";
import { normalizeEvents } from "./timelineUtils";
import type { GridBeat } from "./midiParser";
import type { NoteEvent } from "./types";

export interface WeakBar {
  bar: number; // numbered like the timeline's bar labels (1 = first bar the selected notes reach)
  accuracyPct: number;
  notes: string[]; // e.g. "1 missed", "pause 0.9s"
}

export interface TakeInsights {
  tempoWobblePct: number | null; // std-dev of the local pace around your own average pace, in %
  hesitations: { count: number; totalMs: number };
  chordSpreadMs: number | null; // average gap between the first and last note of chords you played
  holdVsRefPct: number | null; // your note lengths vs. the reference's, adjusted for your tempo (100 = same)
  dynamicShapePct: number | null; // correlation of your loud/soft pattern with the reference's (100 = same shape; ignores overall loudness)
  dynamicRangePct: number | null; // your loud-to-soft contrast as a % of the reference's (100 = same contrast)
  weakBars: WeakBar[];
}

const WINDOW = 4; // consecutive note-to-note gaps averaged into one "local pace" reading
const MIN_REF_GAP_MS = 80; // ignore gaps this short — they're near-simultaneous notes, too noisy to judge tempo
const MIN_PAUSE_MS = 500; // a pause is a gap at least this much longer than expected AND at least 2x the expected length

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Pair {
  stepIdx: number;
  ref: ChordGroup;
  played: ChordGroup;
}

/**
 * Practice-oriented numbers derived from the note alignment (compareTakeToReference). Everything
 * here works on *consecutive* matched notes only, so a missed note, an extra, or a skipped repeat
 * never distorts a tempo reading: those gaps simply aren't measured.
 */
export function computeTakeInsights(result: ComparisonResult, referenceEvents: NoteEvent[], takeEvents: NoteEvent[], beats: GridBeat[] | undefined): TakeInsights {
  const pairs: Pair[] = [];
  result.steps.forEach((s, stepIdx) => {
    if ((s.type === "matched" || s.type === "partial") && s.ref && s.played) pairs.push({ stepIdx, ref: s.ref, played: s.played });
  });

  // Note-to-note gaps between directly adjacent matched notes: how long the reference gives vs. how long you took.
  const gaps: { refMs: number; takeMs: number; later: Pair; runStart: boolean }[] = [];
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i].stepIdx !== pairs[i - 1].stepIdx + 1) continue;
    const refMs = pairs[i].ref.anchorTime - pairs[i - 1].ref.anchorTime;
    const takeMs = pairs[i].played.anchorTime - pairs[i - 1].played.anchorTime;
    if (refMs < MIN_REF_GAP_MS || takeMs <= 0) continue;
    const prev = gaps[gaps.length - 1];
    gaps.push({ refMs, takeMs, later: pairs[i], runStart: !prev || prev.later.stepIdx !== pairs[i - 1].stepIdx });
  }

  const fallbackRatio = normalizeEvents(takeEvents).total / normalizeEvents(referenceEvents).total;
  const paceRatio = gaps.length >= 3 ? median(gaps.map((g) => g.takeMs / g.refMs)) : fallbackRatio;

  // Hesitations: gaps far longer than the reference's rhythm (at your pace) calls for.
  const isPause = (g: (typeof gaps)[number]) => g.takeMs - g.refMs * paceRatio >= Math.max(MIN_PAUSE_MS, g.refMs * paceRatio);
  const pauses = gaps.filter(isPause).map((g) => ({ ...g, excess: g.takeMs - g.refMs * paceRatio }));

  // Tempo wobble: pace over sliding windows of gaps, relative to your own median pace. Pauses are
  // left out (they're reported separately and would otherwise swamp the reading).
  let tempoWobblePct: number | null = null;
  const windowDevs: number[] = [];
  let run: typeof gaps = [];
  const flushRun = () => {
    for (let i = 0; i + WINDOW <= run.length; i++) {
      const w = run.slice(i, i + WINDOW);
      const ratio = w.reduce((a, g) => a + g.takeMs, 0) / w.reduce((a, g) => a + g.refMs, 0);
      windowDevs.push(ratio / paceRatio - 1);
    }
    run = [];
  };
  gaps.forEach((g) => {
    if (g.runStart || isPause(g)) flushRun();
    if (!isPause(g)) run.push(g);
  });
  flushRun();
  if (windowDevs.length >= 3) {
    const mean = windowDevs.reduce((a, d) => a + d, 0) / windowDevs.length;
    tempoWobblePct = Math.sqrt(windowDevs.reduce((a, d) => a + (d - mean) ** 2, 0) / windowDevs.length) * 100;
  }


  // Chord spread: first-to-last note of chords you actually played together.
  const spreads = pairs
    .filter((p) => p.played.events.length >= 2)
    .map((p) => {
      const times = p.played.events.map((e) => e.onTime);
      return Math.max(...times) - Math.min(...times);
    });

  // Hold vs reference: each matched note's length against the reference's, scaled by your pace. Pedal-extended notes excluded.
  const holdRatios: number[] = [];
  pairs.forEach((p) => {
    const refByNote = new Map(p.ref.events.map((e) => [e.note, e]));
    p.played.events.forEach((e) => {
      const r = refByNote.get(e.note);
      if (!r || e.sustained) return;
      const refDur = r.offTime - r.onTime;
      if (refDur < 50) return;
      holdRatios.push((e.offTime - e.onTime) / (refDur * paceRatio));
    });
  });

  // Dynamics: compare velocity *patterns* over matched notes, not absolute levels (keyboards and touch differ).
  const meanVel = (c: ChordGroup) => c.events.reduce((a, e) => a + e.velocity, 0) / c.events.length;
  const refVels = pairs.map((p) => meanVel(p.ref));
  const takeVels = pairs.map((p) => meanVel(p.played));
  let dynamicShapePct: number | null = null;
  let dynamicRangePct: number | null = null;
  if (pairs.length >= 8) {
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    const mr = mean(refVels);
    const mt = mean(takeVels);
    const cov = refVels.reduce((a, r, i) => a + (r - mr) * (takeVels[i] - mt), 0);
    const varR = refVels.reduce((a, r) => a + (r - mr) ** 2, 0);
    const varT = takeVels.reduce((a, t) => a + (t - mt) ** 2, 0);
    if (varR > 0 && varT > 0) {
      dynamicShapePct = (cov / Math.sqrt(varR * varT)) * 100;
      dynamicRangePct = Math.sqrt(varT / varR) * 100;
    }
  }

  // Weakest bars, from the reference's bar grid (numbered the same way the timeline labels them).
  const weakBars: WeakBar[] = [];
  if (beats && beats.length > 0) {
    const ref = normalizeEvents(referenceEvents);
    const inRange = beats.filter((b) => b.ms >= ref.t0 - 0.5 && b.ms <= ref.t0 + ref.total + 0.5);
    const firstBar = inRange.find((b) => b.beatInBar === 1)?.bar ?? 1;
    const barOf = (ms: number) => {
      let lo = 0;
      let hi = beats.length - 1;
      let found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid].ms <= ms + 0.5) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return Math.max(1, beats[found].bar - firstBar + 1);
    };

    const bars = new Map<number, { count: number; score: number; missed: number; wrong: number; partial: number; extra: number; pauses: number; pauseMs: number }>();
    const slot = (n: number) => {
      if (!bars.has(n)) bars.set(n, { count: 0, score: 0, missed: 0, wrong: 0, partial: 0, extra: 0, pauses: 0, pauseMs: 0 });
      return bars.get(n)!;
    };
    let lastBar = 1;
    result.steps.forEach((s) => {
      if (s.type === "repeat") return;
      if (s.ref) lastBar = barOf(s.ref.anchorTime);
      const b = slot(lastBar);
      if (s.type === "extra") {
        b.extra++;
        return;
      }
      b.count++;
      if (s.type === "matched") b.score += 1;
      else if (s.type === "partial" && s.ref && s.played) {
        b.score += chordSimilarity(s.ref, s.played);
        b.partial++;
      } else if (s.type === "wrong") b.wrong++;
      else if (s.type === "missed") b.missed++;
    });
    pauses.forEach((p) => {
      const b = slot(barOf(p.later.ref.anchorTime));
      b.pauses++;
      b.pauseMs += p.excess;
    });

    bars.forEach((b, bar) => {
      const denom = b.count + b.extra;
      const accuracyPct = denom ? Math.round((100 * b.score) / denom) : 100;
      if (accuracyPct >= 100 && b.pauses === 0) return;
      const notes: string[] = [];
      if (b.missed) notes.push(`${b.missed} missed`);
      if (b.wrong) notes.push(`${b.wrong} wrong`);
      if (b.partial) notes.push(`${b.partial} partial`);
      if (b.extra) notes.push(`${b.extra} extra`);
      if (b.pauses) notes.push(`pause ${(b.pauseMs / 1000).toFixed(1)}s`);
      weakBars.push({ bar, accuracyPct, notes });
    });
    weakBars.sort((a, b) => a.accuracyPct - b.accuracyPct || b.notes.length - a.notes.length || a.bar - b.bar);
    weakBars.length = Math.min(weakBars.length, 3);
  }

  return {
    tempoWobblePct,
    hesitations: { count: pauses.length, totalMs: pauses.reduce((a, p) => a + p.excess, 0) },
    chordSpreadMs: spreads.length ? spreads.reduce((a, s) => a + s, 0) / spreads.length : null,
    holdVsRefPct: holdRatios.length ? median(holdRatios) * 100 : null,
    dynamicShapePct,
    dynamicRangePct,
    weakBars,
  };
}
