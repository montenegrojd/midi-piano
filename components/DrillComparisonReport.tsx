import type { DrillGradingResult } from "@/lib/drillGrading";
import styles from "./ComparisonReport.module.css";

interface DrillComparisonReportProps {
  result: DrillGradingResult | null;
}

/**
 * Rhythm-accuracy report for a drill take — the timing-only analog of ComparisonReport, reusing
 * its visual style but a different category set (hit/missed/extra, not matched/partial/wrong/repeat,
 * since pitch is never graded here).
 */
export default function DrillComparisonReport({ result }: DrillComparisonReportProps) {
  if (!result) {
    return <div className={styles.empty}>Record a take above to see a rhythm-accuracy report here.</div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Rhythm accuracy</div>
      <div className={styles.statsGrid}>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.accuracyPct}%</div>
          <div className={styles.lbl}>Accuracy</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>
            {result.hits}/{result.beats.length}
          </div>
          <div className={styles.lbl}>Hit</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.missed}</div>
          <div className={styles.lbl}>Missed</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.extra}</div>
          <div className={styles.lbl}>Extra</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{Math.round(result.avgDeviationMs)}ms</div>
          <div className={styles.lbl}>Avg drift</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.avgDeviationPct}%</div>
          <div className={styles.lbl}>Drift (% of tap)</div>
        </div>
      </div>
    </div>
  );
}
