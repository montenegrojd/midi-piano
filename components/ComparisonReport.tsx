import { midiToName } from "@/lib/chords";
import type { AlignmentStep, ChordGroup, ComparisonResult, StepType } from "@/lib/comparison";
import styles from "./ComparisonReport.module.css";

interface ComparisonReportProps {
  result: ComparisonResult | null;
}

const TYPE_COLOR: Record<StepType, string> = {
  matched: "var(--ivory-dim)",
  missed: "var(--danger)",
  wrong: "var(--danger)",
  extra: "var(--info)",
  partial: "var(--brass-glow)",
  repeat: "#6a6455",
};

function chordName(c: ChordGroup | null): string {
  return c ? c.notes.map(midiToName).join("+") : "—";
}

function playedText(s: AlignmentStep): string {
  if (s.type === "repeat") return "already played earlier in this take (repeated phrase)";
  if (s.type === "partial" && s.ref && s.played) {
    const refSet = new Set(s.ref.notes);
    const playedSet = new Set(s.played.notes);
    const missingNotes = s.ref.notes.filter((n) => !playedSet.has(n)).map(midiToName);
    const extraNotes = s.played.notes.filter((n) => !refSet.has(n)).map(midiToName);
    const detail = [missingNotes.length ? `missing ${missingNotes.join("+")}` : "", extraNotes.length ? `extra ${extraNotes.join("+")}` : ""].filter(Boolean).join(", ");
    return `${chordName(s.played)} (${detail})`;
  }
  return chordName(s.played);
}

/**
 * Note-accuracy comparison: aligns the selected take against the selected reference channels by
 * pitch sequence (not absolute timing, since your tempo won't match the reference), and reports
 * matched/partial/wrong/missed/extra chords — with a repeat-detection pass so a phrase the
 * reference writes out twice doesn't get double-counted against you. Ported from the POC.
 */
export default function ComparisonReport({ result }: ComparisonReportProps) {
  if (!result) {
    return <div className={styles.empty}>Select reference channels and a take above to see a note-accuracy comparison here.</div>;
  }

  const rows = result.steps.filter((s) => s.type !== "matched");

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Note accuracy</div>
      <div className={styles.statsGrid}>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.accuracyPct}%</div>
          <div className={styles.lbl}>Accuracy</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>
            {result.matched}/{result.effectiveRefCount}
          </div>
          <div className={styles.lbl}>Matched</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.partial}</div>
          <div className={styles.lbl}>Partial chord</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{result.wrong}</div>
          <div className={styles.lbl}>Wrong note</div>
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
          <div className={styles.val}>{result.repeat}</div>
          <div className={styles.lbl}>Repeat (excluded)</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={styles.clean}>Every reference note was matched, in order.</div>
      ) : (
        <div className={styles.rows}>
          {rows.map((s, i) => (
            <div className={styles.row} key={i} style={{ color: TYPE_COLOR[s.type] }}>
              <span className={styles.rowType}>{s.type}</span>
              <span className={styles.rowExpected}>expected: {chordName(s.ref)}</span>
              <span>played: {playedText(s)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
