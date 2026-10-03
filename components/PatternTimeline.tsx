"use client";

import { TIMELINE_WIDTH, TIMELINE_LABEL_GUTTER as LABEL_GUTTER, TIMELINE_REFERENCE_FILL, TIMELINE_TAKE_FILL } from "@/lib/constants";
import { totalDurationMs } from "@/lib/drillPattern";
import type { DrillGradingResult } from "@/lib/drillGrading";
import type { GridBeat } from "@/lib/midiParser";
import type { DrillPattern } from "@/lib/types";
import { useElementWidth } from "@/hooks/useElementWidth";
import BarGrid from "./BarGrid";
import Playhead from "./Playhead";
import styles from "./CombinedTimeline.module.css";

interface PatternTimelineProps {
  pattern: DrillPattern;
  beats: GridBeat[];
  grading: DrillGradingResult | null;
  playing?: boolean;
  getPlayFraction?: () => number | null;
}

const H = 140;
const RIGHT_PAD = 10;
const ISSUE_STROKE = "rgba(255,90,90,0.9)";
const EXTRA_FILL = "rgba(255,90,90,0.7)";

/**
 * A single-row analog of CombinedTimeline for drills: the pattern's beats on top, the take's taps
 * below, colored by hit/missed/extra from gradeDrillTake. Unlike CombinedTimeline, both rows share
 * ONE normalization (not each independently stretched to its own duration) — the click and the
 * take are on the same absolute clock by construction, so independent stretching would hide the
 * exact drift this view exists to show.
 */
export default function PatternTimeline({ pattern, beats, grading, playing, getPlayFraction }: PatternTimelineProps) {
  const { ref: widthRef, width: viewW } = useElementWidth(TIMELINE_WIDTH + LABEL_GUTTER);
  const W = Math.max(300, viewW - LABEL_GUTTER - RIGHT_PAD);

  const total = totalDurationMs(pattern);
  const shared = { t0: 0, total, events: [] as never[] };
  const xFor = (ms: number) => LABEL_GUTTER + (ms / total) * W;

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.swatchRef} /> Pattern
        </span>
        {grading && (
          <span className={styles.legendItem}>
            <span className={styles.swatchTake} /> Your taps
          </span>
        )}
        {grading && (
          <span className={styles.legendItem}>
            <span className={styles.swatchIssue} /> Missed / extra
          </span>
        )}
      </div>
      <div className={styles.svgWrap} ref={widthRef}>
        <svg viewBox={`0 0 ${LABEL_GUTTER + W + RIGHT_PAD} ${H}`} width="100%" height={H} style={{ display: "block" }}>
          <BarGrid beats={beats} reference={shared} height={H} plotWidth={W} />

          {grading?.beats.map((b, i) => {
            const x = xFor(b.beatMs);
            const missed = b.status === "missed";
            return <rect key={`ref${i}`} x={(x - 1.5).toFixed(1)} y={8} width={3} height={H / 2 - 16} rx={1.5} fill={TIMELINE_REFERENCE_FILL} stroke={missed ? ISSUE_STROKE : "none"} strokeWidth={missed ? 1.5 : 0} />;
          })}

          {grading?.beats
            .filter((b) => b.tapMs !== null)
            .map((b, i) => (
              <rect key={`hit${i}`} x={(xFor(b.tapMs!) - 1.5).toFixed(1)} y={H / 2 + 8} width={3} height={H / 2 - 16} rx={1.5} fill={TIMELINE_TAKE_FILL} />
            ))}
          {grading?.extraTapMs.map((ms, i) => (
            <rect key={`extra${i}`} x={(xFor(ms) - 1.5).toFixed(1)} y={H / 2 + 8} width={3} height={H / 2 - 16} rx={1.5} fill={EXTRA_FILL} stroke={ISSUE_STROKE} strokeWidth={1.5} />
          ))}

          {getPlayFraction && <Playhead active={!!playing} getFraction={getPlayFraction} plotWidth={W} height={H} />}
        </svg>
      </div>
    </div>
  );
}
