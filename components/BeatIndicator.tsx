"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./BeatIndicator.module.css";

interface BeatIndicatorProps {
  active: boolean;
  getElapsedMs: () => number | null; // ms since the pattern (not count-in) started, or null before/after
  beatIntervalMs: number;
  beatsPerBar: number;
}

/**
 * A pulsing dot in time with the beat, plus a bar/beat readout — replaces the Keyboard/StaffView
 * from Play & Capture here, since pitch is never relevant to a drill. Like Playhead, the pulse
 * itself is driven by an imperative rAF loop mutating a DOM node directly rather than React state,
 * so it stays visually tight; the bar/beat text is plain state, updated only when it changes.
 */
export default function BeatIndicator({ active, getElapsedMs, beatIntervalMs, beatsPerBar }: BeatIndicatorProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  const [barBeatText, setBarBeatText] = useState("— : —");
  const cbRef = useRef({ getElapsedMs, beatIntervalMs, beatsPerBar });
  cbRef.current = { getElapsedMs, beatIntervalMs, beatsPerBar };

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;
    if (!active) {
      dot.style.transform = "scale(1)";
      setBarBeatText("— : —");
      return;
    }
    let raf = 0;
    let lastBeatIndex = -1;
    const frame = () => {
      const elapsed = cbRef.current.getElapsedMs();
      if (elapsed === null) {
        dot.style.transform = "scale(1)";
      } else {
        const beatIndex = Math.floor(elapsed / cbRef.current.beatIntervalMs);
        const phase = (elapsed % cbRef.current.beatIntervalMs) / cbRef.current.beatIntervalMs; // 0 right on the beat, →1 just before the next
        const pulse = Math.max(0, 1 - phase * 4); // sharp decay so the pulse reads as a flash, not a slow breathe
        dot.style.transform = `scale(${1 + pulse * 0.35})`;
        if (beatIndex !== lastBeatIndex) {
          lastBeatIndex = beatIndex;
          const bar = Math.floor(beatIndex / cbRef.current.beatsPerBar) + 1;
          const beatInBar = (beatIndex % cbRef.current.beatsPerBar) + 1;
          setBarBeatText(`${bar} : ${beatInBar}`);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div className={styles.wrap}>
      <div ref={dotRef} className={styles.dot} />
      <div className={styles.barBeat}>{barBeatText}</div>
    </div>
  );
}
