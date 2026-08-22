import type { NoteEvent } from "./types";

export interface NormalizedEvents {
  t0: number;
  total: number;
  events: NoteEvent[];
}

/**
 * Normalizes a note sequence to its own start time and duration, so it can be stretched to fill
 * a fixed-width chart regardless of its actual tempo/length. Shared by CombinedTimeline and
 * VelocityChart so both independently-normalized datasets land at the same x positions.
 */
export function normalizeEvents(events: NoteEvent[]): NormalizedEvents {
  if (events.length === 0) return { t0: 0, total: 1, events };
  const t0 = Math.min(...events.map((e) => e.onTime));
  const total = Math.max(...events.map((e) => e.offTime)) - t0 || 1;
  return { t0, total, events };
}
