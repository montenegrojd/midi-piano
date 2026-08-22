import type { NoteEvent, TakeStats } from "./types";

/**
 * Ported from the POC (midi-keyboard-poc.html: computeStats). "Consistency" measures how *even*
 * the gaps between note onsets are relative to their own mean — not adherence to a metronome or
 * to the reference's intended rhythm. See the in-app note on this stat for the caveat.
 */
export function computeStats(events: NoteEvent[]): TakeStats {
  const n = events.length;
  const totalDuration = (Math.max(...events.map((e) => e.offTime)) - Math.min(...events.map((e) => e.onTime))) / 1000;
  const onsets = events.map((e) => e.onTime).sort((a, b) => a - b);
  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i++) iois.push(onsets[i] - onsets[i - 1]);
  const avgIOI = iois.length ? iois.reduce((a, b) => a + b, 0) / iois.length : 0;
  const meanIOI = avgIOI;
  const variance = iois.length ? iois.reduce((a, b) => a + Math.pow(b - meanIOI, 2), 0) / iois.length : 0;
  const stdIOI = Math.sqrt(variance);
  const consistencyPct = meanIOI > 0 ? Math.max(0, 100 - (stdIOI / meanIOI) * 100) : 0;
  const avgVelocity = events.reduce((a, e) => a + e.velocity, 0) / n;
  const avgDuration = events.reduce((a, e) => a + (e.offTime - e.onTime), 0) / n;
  const approxBPM = avgIOI > 0 ? Math.round(60000 / avgIOI) : 0;

  return {
    noteCount: n,
    totalDuration: totalDuration.toFixed(1),
    avgIOI: Math.round(avgIOI),
    consistencyPct: Math.round(consistencyPct),
    avgVelocity: Math.round(avgVelocity),
    avgDuration: Math.round(avgDuration),
    approxBPM,
  };
}
