import { useCallback, useRef, useState } from "react";
import { totalDurationMs, tapIntervalMs, beatIntervalMs } from "@/lib/drillPattern";
import type { DrillPattern } from "@/lib/types";

export interface ClickTrackHandle {
  countInEndPerfMs: number; // performance.now()-space — pass straight into recorder.startRecording(t0)
  patternEndPerfMs: number; // drives the auto-stop timer
  stop: () => void; // cancels every scheduled click still ahead — used to cancel a drill in progress
}

/**
 * A metronome click, audible with no MIDI output device connected (the app has no other Web Audio
 * usage — everything else is either real MIDI-out or silent). Since a drill's total duration is
 * known upfront, every click is scheduled synchronously at start via the AudioContext's own clock,
 * not an incremental lookahead loop (that pattern is for unbounded playback).
 *
 * The tricky part is that AudioContext.currentTime and performance.now() are different clocks —
 * the anchor pair captured right after ctx.resume() resolves lets every scheduled click convert
 * cleanly into performance.now()-space, which is what the recorder and grading are built on.
 */
export function useClickTrack() {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);

  const stop = useCallback(() => {
    nodesRef.current.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(0);
        osc.stop();
      } catch {
        // already stopped/ended — fine to ignore
      }
    });
    nodesRef.current = [];
    setPlaying(false);
  }, []);

  const start = useCallback((pattern: DrillPattern, countInBars: number): ClickTrackHandle => {
    stop();
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = ctxRef.current && ctxRef.current.state !== "closed" ? ctxRef.current : new AudioContextCtor();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();

    const anchorPerfMs = performance.now();
    const anchorCtxSec = ctx.currentTime;
    const perfMs = (audioSec: number) => anchorPerfMs + (audioSec - anchorCtxSec) * 1000;

    const beatMs = beatIntervalMs(pattern);
    const countInBeats = countInBars * pattern.timeSignature.numerator;
    const countInMs = countInBeats * beatMs;
    const tapMs = tapIntervalMs(pattern);
    const totalTaps = Math.round((countInMs + totalDurationMs(pattern)) / tapMs);

    // A short percussive blip per subdivision tick; accent every downbeat (count-in included).
    const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
    for (let i = 0; i < totalTaps; i++) {
      const tMs = i * tapMs;
      const beatIndex = tMs / beatMs;
      const isOnBeat = Math.abs(beatIndex - Math.round(beatIndex)) < 1e-6;
      const isDownbeat = isOnBeat && Math.round(beatIndex) % pattern.timeSignature.numerator === 0;
      const startSec = ctx.currentTime + tMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = isDownbeat ? 1000 : 700;
      gain.gain.setValueAtTime(0.0001, startSec);
      gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.5 : 0.3, startSec + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, startSec + 0.02);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startSec);
      osc.stop(startSec + 0.03);
      nodes.push({ osc, gain });
    }
    nodesRef.current = nodes;
    setPlaying(true);

    return {
      countInEndPerfMs: perfMs(ctx.currentTime + countInMs / 1000),
      patternEndPerfMs: perfMs(ctx.currentTime + (countInMs + totalDurationMs(pattern)) / 1000),
      stop,
    };
  }, [stop]);

  return { start, stop, playing };
}
