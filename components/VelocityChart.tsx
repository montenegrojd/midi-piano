import { TIMELINE_WIDTH as W, TIMELINE_LABEL_GUTTER as LABEL_GUTTER, TIMELINE_REFERENCE_FILL, TIMELINE_TAKE_FILL } from "@/lib/constants";
import { normalizeEvents, type NormalizedEvents } from "@/lib/timelineUtils";
import type { NoteEvent } from "@/lib/types";
import styles from "./VelocityChart.module.css";

interface VelocityChartProps {
  referenceEvents: NoteEvent[];
  takeEvents: NoteEvent[] | null;
}

const H = 110;
const GRID_VALUES = [0, 32, 64, 96, 127];

/**
 * A separate bar chart of note velocity (0-127), sharing the same x-axis width/gutter and
 * per-dataset time normalization as CombinedTimeline so a spike here lines up with the
 * corresponding note directly above it in the pitch timeline.
 */
export default function VelocityChart({ referenceEvents, takeEvents }: VelocityChartProps) {
  const hasReference = referenceEvents.length > 0;
  const hasTake = !!takeEvents && takeEvents.length > 0;

  if (!hasReference && !hasTake) return null;

  const ref = normalizeEvents(referenceEvents);
  const take = normalizeEvents(takeEvents ?? []);

  function bars(norm: NormalizedEvents, fill: string) {
    return norm.events.map((e, i) => {
      const x = LABEL_GUTTER + ((e.onTime - norm.t0) / norm.total) * W;
      const w = Math.max(2, ((e.offTime - e.onTime) / norm.total) * W);
      const barH = (e.velocity / 127) * H;
      return <rect key={i} x={x.toFixed(1)} y={(H - barH).toFixed(1)} width={w.toFixed(1)} height={barH.toFixed(1)} fill={fill} />;
    });
  }

  const gridLines = GRID_VALUES.map((v) => {
    const y = H - (v / 127) * H;
    return (
      <g key={v}>
        <line x1={LABEL_GUTTER} y1={y.toFixed(1)} x2={LABEL_GUTTER + W} y2={y.toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
        <text x={LABEL_GUTTER - 6} y={(y + 3).toFixed(1)} textAnchor="end" fontSize={9} fill="#6a6455">
          {v}
        </text>
      </g>
    );
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Velocity</div>
      <div className={styles.svgWrap}>
        <svg viewBox={`0 0 ${LABEL_GUTTER + W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
          {gridLines}
          {hasReference && bars(ref, TIMELINE_REFERENCE_FILL)}
          {hasTake && bars(take, TIMELINE_TAKE_FILL)}
        </svg>
      </div>
    </div>
  );
}
