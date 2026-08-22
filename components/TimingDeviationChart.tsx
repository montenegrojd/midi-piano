import { computeTimingDeviations, type ComparisonResult } from "@/lib/comparison";
import { TIMELINE_WIDTH as W, TIMELINE_LABEL_GUTTER as LABEL_GUTTER, TIMING_DEVIATION_FILL } from "@/lib/constants";
import type { NoteEvent } from "@/lib/types";
import styles from "./TimingDeviationChart.module.css";

interface TimingDeviationChartProps {
  referenceEvents: NoteEvent[];
  takeEvents: NoteEvent[] | null;
  comparison: ComparisonResult | null;
}

const H = 120;
const HALF = H / 2;
const TICK_WIDTH = 4;

/**
 * For every matched note, plots how far it's drifted from the reference's own rhythm — not from
 * a flat metronome grid, which would flag correct rhythm (mixed note values) as an error. Both
 * sides are normalized to their own total duration first, so an overall tempo difference (playing
 * the whole piece slower) cancels out; what's left is local drift. Above the center line = you
 * got there proportionally sooner than the reference's rhythm would put you (rushing); below =
 * later (dragging).
 */
export default function TimingDeviationChart({ referenceEvents, takeEvents, comparison }: TimingDeviationChartProps) {
  if (!comparison || !takeEvents || takeEvents.length === 0) {
    return <div className={styles.empty}>Select a take above to see how its timing drifts relative to the reference&apos;s own rhythm here.</div>;
  }

  const points = computeTimingDeviations(comparison.steps, referenceEvents, takeEvents);
  if (points.length === 0) {
    return <div className={styles.empty}>No matched notes to compare timing against.</div>;
  }

  const maxAbsDev = Math.max(0.01, ...points.map((p) => Math.abs(p.deviation)));
  const maxPct = (maxAbsDev * 100).toFixed(1);

  const bars = points.map((p, i) => {
    const x = LABEL_GUTTER + p.refFrac * W;
    const barH = Math.max(1, (Math.abs(p.deviation) / maxAbsDev) * HALF);
    const y = p.deviation >= 0 ? HALF : HALF - barH;
    return <rect key={i} x={(x - TICK_WIDTH / 2).toFixed(1)} y={y.toFixed(1)} width={TICK_WIDTH} height={barH.toFixed(1)} fill={TIMING_DEVIATION_FILL} />;
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>
        Timing drift vs. reference <span className={styles.hint}>— above the line = rushing ahead, below = dragging behind</span>
      </div>
      <div className={styles.svgWrap}>
        <svg viewBox={`0 0 ${LABEL_GUTTER + W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
          <line x1={LABEL_GUTTER} y1={HALF} x2={LABEL_GUTTER + W} y2={HALF} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <text x={LABEL_GUTTER - 6} y={10} textAnchor="end" fontSize={9} fill="#6a6455">
            ahead {maxPct}%
          </text>
          <text x={LABEL_GUTTER - 6} y={HALF + 3} textAnchor="end" fontSize={9} fill="#6a6455">
            on pace
          </text>
          <text x={LABEL_GUTTER - 6} y={H - 4} textAnchor="end" fontSize={9} fill="#6a6455">
            behind {maxPct}%
          </text>
          {bars}
        </svg>
      </div>
    </div>
  );
}
