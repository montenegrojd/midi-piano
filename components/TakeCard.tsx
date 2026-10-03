"use client";

import { useState, type MouseEvent } from "react";
import type { Take } from "@/lib/types";
import PlaybackProgress from "./PlaybackProgress";
import styles from "./TakeCard.module.css";

interface TakeCardProps {
  take: Take;
  onDelete: (takeId: string) => void;
  deleting?: boolean;
  selected?: boolean;
  onSelect: (takeId: string) => void;
  onPlay: (take: Take) => void;
  onStopPlayback: () => void;
  isPlaying?: boolean;
  playDisabled?: boolean;
  accuracyPct?: number;
  driftPct?: number; // average timing drift, % of the piece (drills: % of one tap interval)
  elapsedMs: number;
  totalMs: number;
}

export default function TakeCard({
  take,
  onDelete,
  deleting,
  selected,
  onSelect,
  onPlay,
  onStopPlayback,
  isPlaying,
  playDisabled,
  accuracyPct,
  driftPct,
  elapsedMs,
  totalMs,
}: TakeCardProps) {
  const [confirming, setConfirming] = useState(false);

  function stopBubble(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className={`${styles.card} ${selected ? styles.selected : ""}`} onClick={() => onSelect(take.id)}>
      <div className={styles.header}>
        <span className={styles.dateHeading}>{new Date(take.recordedAt).toLocaleString()}</span>
        <div className={styles.headerRight} onClick={stopBubble}>
          <button
            className={`${styles.playBtn} ${isPlaying ? styles.playing : ""}`}
            onClick={() => (isPlaying ? onStopPlayback() : onPlay(take))}
            disabled={!isPlaying && playDisabled}
          >
            {isPlaying ? "■ stop" : "▶ play"}
          </button>
          {confirming ? (
            <span className={styles.confirmRow}>
              Delete?
              <button className={styles.confirmYes} onClick={() => onDelete(take.id)} disabled={deleting}>
                {deleting ? "…" : "Yes"}
              </button>
              <button className={styles.confirmNo} onClick={() => setConfirming(false)} disabled={deleting}>
                No
              </button>
            </span>
          ) : (
            <button className={styles.deleteBtn} onClick={() => setConfirming(true)}>
              delete
            </button>
          )}
        </div>
      </div>
      {isPlaying && <PlaybackProgress elapsedMs={elapsedMs} totalMs={totalMs} />}
      <div className={styles.statsGrid}>
        <div className={styles.statCell}>
          <div className={styles.val}>{accuracyPct !== undefined ? `${accuracyPct}%` : "—"}</div>
          <div className={styles.lbl}>Accuracy</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.val}>{driftPct !== undefined ? `${driftPct.toFixed(1)}%` : "—"}</div>
          <div className={styles.lbl}>Avg timing drift</div>
        </div>
      </div>
    </div>
  );
}
