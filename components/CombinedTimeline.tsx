import { midiToName, NOTE_NAMES } from "@/lib/chords";
import { TIMELINE_WIDTH as W, TIMELINE_LABEL_GUTTER as LABEL_GUTTER, TIMELINE_REFERENCE_FILL, TIMELINE_TAKE_FILL } from "@/lib/constants";
import { normalizeEvents, type NormalizedEvents } from "@/lib/timelineUtils";
import { buildEventStatusMaps, type ComparisonResult, type StepType } from "@/lib/comparison";
import type { NoteEvent } from "@/lib/types";
import styles from "./CombinedTimeline.module.css";

interface CombinedTimelineProps {
  referenceEvents: NoteEvent[];
  takeEvents: NoteEvent[] | null;
  takeLabel?: string;
  comparison?: ComparisonResult | null;
}

const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]); // C D E F G A B — no sharps/flats
const ISSUE_STROKE = "rgba(255,90,90,0.9)";

function isProblem(status: StepType | undefined) {
  return !!status && status !== "matched" && status !== "repeat";
}

/**
 * Overlays the reference's selected channels with the selected take on one set of axes. Each
 * side is independently normalized to its own start time and stretched to fill the full width —
 * this isn't a time-accurate alignment (your tempo won't match the reference), it's a shape
 * comparison: does the pattern of notes line up, where do the two diverge. When a comparison
 * result is available, missed/wrong/partial/extra notes get a red outline (matched and
 * repeat-excluded notes don't, since those aren't errors).
 */
export default function CombinedTimeline({ referenceEvents, takeEvents, takeLabel, comparison }: CombinedTimelineProps) {
  const hasReference = referenceEvents.length > 0;
  const hasTake = !!takeEvents && takeEvents.length > 0;

  if (!hasReference && !hasTake) {
    return <div className={styles.empty}>Select reference channels and/or a take above to compare their timelines here.</div>;
  }

  const { refStatus, takeStatus } = comparison ? buildEventStatusMaps(comparison.steps) : { refStatus: undefined, takeStatus: undefined };

  const allNotes = [...referenceEvents, ...(takeEvents ?? [])];
  const minP = Math.min(...allNotes.map((e) => e.note)) - 2;
  const maxP = Math.max(...allNotes.map((e) => e.note)) + 2;
  const H = Math.max(160, Math.min(900, (maxP - minP) * 14)); // 14px/row keeps pitch labels legible
  const rowH = H / (maxP - minP);

  const ref = normalizeEvents(referenceEvents);
  const take = normalizeEvents(takeEvents ?? []);

  function bars(norm: NormalizedEvents, fill: string, statusMap?: Map<NoteEvent, StepType>) {
    return norm.events.map((e, i) => {
      const x = LABEL_GUTTER + ((e.onTime - norm.t0) / norm.total) * W;
      const w = Math.max(2, ((e.offTime - e.onTime) / norm.total) * W);
      const y = H - (e.note - minP) * rowH;
      const flag = isProblem(statusMap?.get(e));
      return (
        <rect
          key={i}
          x={x.toFixed(1)}
          y={(y - rowH).toFixed(1)}
          width={w.toFixed(1)}
          height={(rowH * 0.7).toFixed(1)}
          rx={1.5}
          fill={fill}
          stroke={flag ? ISSUE_STROKE : "none"}
          strokeWidth={flag ? 1.5 : 0}
        />
      );
    });
  }

  const pitchLabels = [];
  for (let note = Math.ceil(minP); note <= Math.floor(maxP); note++) {
    if (!NATURAL_PITCH_CLASSES.has(note % 12)) continue;
    const y = H - (note - minP) * rowH;
    const isC = note % 12 === 0;
    pitchLabels.push(
      <g key={note}>
        <line x1={LABEL_GUTTER} y1={y.toFixed(1)} x2={LABEL_GUTTER + W} y2={y.toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth={isC ? 1 : 0.5} />
        <text x={LABEL_GUTTER - 6} y={(y - rowH / 2 + 3.5).toFixed(1)} textAnchor="end" fontSize={rowH > 12 ? 11 : rowH > 8 ? 9 : 7} fill={isC ? "#8a7f66" : "#4a4432"}>
          {isC ? midiToName(note) : NOTE_NAMES[note % 12]}
        </text>
      </g>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        {hasReference && (
          <span className={styles.legendItem}>
            <span className={styles.swatchRef} /> Reference
          </span>
        )}
        {hasTake && (
          <span className={styles.legendItem}>
            <span className={styles.swatchTake} /> {takeLabel ?? "Take"}
          </span>
        )}
        {comparison && (
          <span className={styles.legendItem}>
            <span className={styles.swatchIssue} /> Missed / wrong / extra
          </span>
        )}
      </div>
      <div className={styles.svgWrap}>
        <svg viewBox={`0 0 ${LABEL_GUTTER + W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
          {pitchLabels}
          {hasReference && bars(ref, TIMELINE_REFERENCE_FILL, refStatus)}
          {hasTake && bars(take, TIMELINE_TAKE_FILL, takeStatus)}
        </svg>
      </div>
    </div>
  );
}
