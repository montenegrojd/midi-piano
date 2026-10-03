"use client";

import { useEffect, useState, type FocusEvent, type MouseEvent } from "react";
import type { TakeInsights } from "@/lib/takeInsights";
import type { Take } from "@/lib/types";
import styles from "./TakeStatsPanel.module.css";

interface TakeStatsPanelProps {
  take: Take;
  kind?: "piece" | "drill";
  accuracyPct?: number;
  driftPct?: number; // average |drift|
  netDriftPct?: number; // signed: positive = behind (dragging), negative = ahead (rushing)
  insights?: TakeInsights | null; // pieces only — needs a reference to compare against
}

interface Metric {
  id: string;
  group: string;
  label: string;
  value: string;
  plain: string; // what it means, in plain English
  aim: string; // how to read it / what to aim for
}

const VIEW_KEY = "takeStatsView";

function buildMetrics(props: TakeStatsPanelProps): Metric[] {
  const { take, kind = "piece", accuracyPct, driftPct, netDriftPct, insights } = props;
  const { stats } = take;
  const drill = kind === "drill";
  const net = netDriftPct === undefined ? "—" : Math.abs(netDriftPct) < 0.05 ? "even" : `${Math.abs(netDriftPct).toFixed(1)}% ${netDriftPct > 0 ? "behind" : "ahead"}`;

  const metrics: Metric[] = [
    {
      id: "accuracy",
      group: "Accuracy & timing",
      label: "Accuracy",
      value: accuracyPct !== undefined ? `${accuracyPct}%` : "—",
      plain: drill
        ? "How many of the beats you tapped, and how close to the click each one landed. Extra taps count against you."
        : "How many of the reference's notes you played correctly. Extra notes you added count against you.",
      aim: "100% means every note, nothing extra. Around 95% or more is a clean run.",
    },
    {
      id: "drift",
      group: "Accuracy & timing",
      label: "Avg timing drift",
      value: driftPct !== undefined ? `${driftPct.toFixed(1)}%` : "—",
      plain: drill
        ? "How far your taps land from the click on average, as a percentage of one beat division. Early or late both count."
        : "How far you are from the reference's rhythm, on average, as a percentage of the piece. Early or late both count.",
      aim: "Lower is tighter. Under about 1% is very close to the reference's rhythm.",
    },
    {
      id: "net",
      group: "Accuracy & timing",
      label: "Net rush / drag",
      value: net,
      plain: "Which way your timing leans overall. Ahead means you tend to rush, behind means you tend to drag.",
      aim: "Close to even is ideal. A big number shows a habit to work on.",
    },
  ];

  if (insights) {
    const h = insights.hesitations;
    metrics.push(
      {
        id: "wobble",
        group: "Accuracy & timing",
        label: "Tempo wobble",
        value: insights.tempoWobblePct === null ? "—" : `±${insights.tempoWobblePct.toFixed(0)}%`,
        plain: "How much your speed changes from phrase to phrase compared with your own average speed. Pauses are left out.",
        aim: "Lower is steadier. It shows speeding up and slowing down that the drift chart can hide.",
      },
      {
        id: "pauses",
        group: "Accuracy & timing",
        label: "Pauses",
        value: h.count === 0 ? "none" : `${h.count} · ${(h.totalMs / 1000).toFixed(1)}s`,
        plain: "Places where a note took at least twice as long as the rhythm calls for at your pace, usually while finding the next note. Shows how many, and the total time lost.",
        aim: "Fewer and shorter is better. The weakest bars below show where they happen.",
      }
    );
  }

  metrics.push(
    {
      id: "velocity",
      group: "Touch & dynamics",
      label: "Avg velocity (0–127)",
      value: `${stats.avgVelocity}`,
      plain: "How hard you pressed the keys on average. Higher means louder.",
      aim: "There's no right number. It depends on your keyboard and the piece, so use Dynamic shape to judge it.",
    },
    {
      id: "holdAvg",
      group: "Touch & dynamics",
      label: "Avg note hold",
      value: `${stats.avgDuration}ms`,
      plain: "How long you held each key down on average.",
      aim: "Depends on the piece. Hold vs reference tells you whether it was right.",
    }
  );

  if (insights) {
    metrics.push(
      {
        id: "shape",
        group: "Touch & dynamics",
        label: "Dynamic shape",
        value: insights.dynamicShapePct === null ? "—" : `${Math.round(insights.dynamicShapePct)}%`,
        plain: "How closely your loud-and-soft pattern follows the reference's, note by note. It ignores how loud you play overall, so your keyboard doesn't matter.",
        aim: "Higher is better, and 100% is the same shape. Near 0% means your dynamics don't follow the written ones yet.",
      },
      {
        id: "range",
        group: "Touch & dynamics",
        label: "Dynamic range",
        value: insights.dynamicRangePct === null ? "—" : `${Math.round(insights.dynamicRangePct)}%`,
        plain: "Your contrast between loud and soft notes as a percentage of the reference's.",
        aim: "Close to 100% matches the reference's contrast. Under 100% is flatter, over 100% is exaggerated.",
      },
      {
        id: "holdRef",
        group: "Touch & dynamics",
        label: "Hold vs reference",
        value: insights.holdVsRefPct === null ? "—" : `${Math.round(insights.holdVsRefPct)}%`,
        plain: "Your note lengths compared with the reference's, adjusted for your tempo.",
        aim: "About 100% is right. Under that is shorter and choppier, over it is longer and more blurred.",
      },
      {
        id: "chord",
        group: "Touch & dynamics",
        label: "Chord spread",
        value: insights.chordSpreadMs === null ? "—" : `${Math.round(insights.chordSpreadMs)}ms`,
        plain: "The average time between the first and last note of chords you played.",
        aim: "Lower means your hands land together. A few tens of milliseconds is normal.",
      }
    );
  }

  metrics.push(
    { id: "notes", group: "Pace", label: "Notes played", value: `${stats.noteCount}`, plain: "How many notes you played in this take.", aim: "Compare with the reference's note count." },
    { id: "length", group: "Pace", label: "Take length", value: `${stats.totalDuration}s`, plain: "How long the take lasted, from first note to last.", aim: "Longer than the reference usually means slower playing or pauses." },
    { id: "npm", group: "Pace", label: "Notes / min", value: `~${stats.approxBPM}`, plain: "How fast you played, as notes per minute.", aim: "A rough pace figure, so compare takes of the same piece." }
  );
  return metrics;
}

/**
 * Every metric for the selected take, shown above the charts. The take cards in the sidebar only
 * keep the two headline numbers so a long list stays scannable. "Simple" is a compact grid with an
 * instant hover/focus explanation; "Detailed" is a table spelling out each metric in plain English.
 */
export default function TakeStatsPanel(props: TakeStatsPanelProps) {
  const { take, insights } = props;
  const [view, setView] = useState<"simple" | "detailed">("simple");
  const [tip, setTip] = useState<{ metric: Metric; left: number; top: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "simple" || saved === "detailed") setView(saved);
    } catch {
      // storage unavailable — default view is fine
    }
  }, []);

  function chooseView(v: "simple" | "detailed") {
    setView(v);
    setTip(null);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  }

  const metrics = buildMetrics(props);
  const groups = [...new Set(metrics.map((m) => m.group))];

  function showTip(e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, metric: Metric) {
    const r = e.currentTarget.getBoundingClientRect();
    const width = 270;
    setTip({ metric, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2)), top: r.bottom + 6 });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>{new Date(take.recordedAt).toLocaleString()}</div>
        <div className={styles.toggle} role="group" aria-label="Metrics view">
          <button className={view === "simple" ? styles.toggleOn : ""} onClick={() => chooseView("simple")}>
            Simple
          </button>
          <button className={view === "detailed" ? styles.toggleOn : ""} onClick={() => chooseView("detailed")}>
            Detailed
          </button>
        </div>
      </div>

      {view === "simple" ? (
        <div className={styles.grid}>
          {metrics.map((m) => (
            <div className={styles.cell} key={m.id} tabIndex={0} onMouseEnter={(e) => showTip(e, m)} onMouseLeave={() => setTip(null)} onFocus={(e) => showTip(e, m)} onBlur={() => setTip(null)}>
              <div className={styles.val}>{m.value}</div>
              <div className={styles.lbl}>{m.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Your take</th>
              <th>What it means</th>
              <th>How to read it</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr className={styles.groupRow}>
                <td colSpan={4}>{g}</td>
              </tr>
              {metrics
                .filter((m) => m.group === g)
                .map((m) => (
                  <tr key={m.id}>
                    <td className={styles.metricName}>{m.label}</td>
                    <td className={styles.metricVal}>{m.value}</td>
                    <td>{m.plain}</td>
                    <td className={styles.aim}>{m.aim}</td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      )}

      {insights && (
        <div className={styles.weak}>
          <span className={styles.weakLabel}>Weakest bars</span>
          {insights.weakBars.length === 0 ? (
            <span>none — clean throughout</span>
          ) : (
            insights.weakBars.map((b) => (
              <span className={styles.weakBar} key={b.bar}>
                <strong>bar {b.bar}</strong> {b.accuracyPct}%{b.notes.length ? ` · ${b.notes.join(", ")}` : ""}
              </span>
            ))
          )}
        </div>
      )}

      {tip && (
        <div className={styles.tip} style={{ left: tip.left, top: tip.top }} role="tooltip">
          <div className={styles.tipTitle}>{tip.metric.label}</div>
          <div>{tip.metric.plain}</div>
          <div className={styles.tipAim}>{tip.metric.aim}</div>
        </div>
      )}
    </div>
  );
}
