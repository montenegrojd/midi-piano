"use client";

import { computeTimingDeviations, type ComparisonResult } from "@/lib/comparison";
import { TIMELINE_WIDTH, TIMELINE_LABEL_GUTTER as LABEL_GUTTER, TIMING_DEVIATION_FILL } from "@/lib/constants";
import { normalizeEvents } from "@/lib/timelineUtils";
import type { GridBeat } from "@/lib/midiParser";
import type { NoteEvent } from "@/lib/types";
import { useElementWidth } from "@/hooks/useElementWidth";
import BarGrid from "./BarGrid";
import Playhead from "./Playhead";
import styles from "./TimingDeviationChart.module.css";

interface TimingDeviationChartProps {
  referenceEvents: NoteEvent[];
  takeEvents: NoteEvent[] | null;
  comparison: ComparisonResult | null;
  beats?: GridBeat[];
  playing?: boolean;
  playingAxis?: "reference" | "take"; // whose timeline the playing position is measured on
  getPlayFraction?: () => number | null;
}

const H = 120;
const RIGHT_PAD = 10;
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
export default function TimingDeviationChart({ referenceEvents, takeEvents, comparison, beats, playing, playingAxis, getPlayFraction }: TimingDeviationChartProps) {
  const { ref: widthRef, width: viewW } = useElementWidth(TIMELINE_WIDTH + LABEL_GUTTER);
  const W = Math.max(300, viewW - LABEL_GUTTER - RIGHT_PAD); // plot width: everything to the right of the label gutter

  if (!comparison || !takeEvents || takeEvents.length === 0) {
    return <div className={styles.empty}>Select a take above to see how its timing drifts relative to the reference&apos;s own rhythm here.</div>;
  }

  const points = computeTimingDeviations(comparison.steps, referenceEvents, takeEvents);
  if (points.length === 0) {
    return <div className={styles.empty}>No matched notes to compare timing against.</div>;
  }

  // This chart is laid out by position in the reference. A playing take's position is mapped onto
  // that axis by interpolating between matched notes (takeFrac = refFrac + deviation).
  const anchors = [{ take: 0, ref: 0 }, ...points.map((p) => ({ take: p.refFrac + p.deviation, ref: p.refFrac })), { take: 1, ref: 1 }].sort((a, b) => a.take - b.take);
  function takeToRef(t: number) {
    for (let i = 1; i < anchors.length; i++) {
      if (t <= anchors[i].take) {
        const span = anchors[i].take - anchors[i - 1].take;
        return span > 0 ? anchors[i - 1].ref + ((t - anchors[i - 1].take) / span) * (anchors[i].ref - anchors[i - 1].ref) : anchors[i].ref;
      }
    }
    return 1;
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
      <div className={styles.svgWrap} ref={widthRef}>
        <svg viewBox={`0 0 ${LABEL_GUTTER + W + RIGHT_PAD} ${H}`} width="100%" height={H} style={{ display: "block" }}>
          <BarGrid beats={beats} reference={normalizeEvents(referenceEvents)} height={H} plotWidth={W} showLabels={false} />
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
          {getPlayFraction && <Playhead active={!!playing} getFraction={getPlayFraction} mapFraction={playingAxis === "take" ? takeToRef : undefined} plotWidth={W} height={H} />}
        </svg>
      </div>
    </div>
  );
}
