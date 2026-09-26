"use client";

import { useEffect, useRef } from "react";
import { TIMELINE_LABEL_GUTTER as LABEL_GUTTER } from "@/lib/constants";

interface PlayheadProps {
  active: boolean;
  getFraction: () => number | null; // 0-1 through the playing sequence, or null when nothing is playing
  mapFraction?: (fraction: number) => number; // optional remap onto this chart's axis (e.g. take position → reference position)
  plotWidth: number;
  height: number;
}

/**
 * A vertical line that follows playback. It runs its own animation-frame loop and moves the SVG
 * line directly, so smooth motion costs no React re-renders — and it only loops while active.
 */
export default function Playhead({ active, getFraction, mapFraction, plotWidth, height }: PlayheadProps) {
  const lineRef = useRef<SVGLineElement>(null);
  const cbRef = useRef({ getFraction, mapFraction, plotWidth });
  cbRef.current = { getFraction, mapFraction, plotWidth };

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    if (!active) {
      line.style.visibility = "hidden";
      return;
    }
    let raf = 0;
    const frame = () => {
      const raw = cbRef.current.getFraction();
      if (raw === null) {
        line.style.visibility = "hidden";
      } else {
        const f = Math.max(0, Math.min(1, cbRef.current.mapFraction ? cbRef.current.mapFraction(raw) : raw));
        const x = LABEL_GUTTER + f * cbRef.current.plotWidth;
        line.setAttribute("x1", String(x));
        line.setAttribute("x2", String(x));
        line.style.visibility = "visible";
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <line ref={lineRef} x1={LABEL_GUTTER} x2={LABEL_GUTTER} y1={0} y2={height} stroke="var(--brass-glow)" strokeWidth={2} style={{ visibility: "hidden" }} pointerEvents="none" />;
}
