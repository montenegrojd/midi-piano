import { useCallback, useRef, useState } from "react";
import { PLAYBACK_CHANNEL } from "@/lib/constants";
import type { NoteEvent } from "@/lib/types";

interface UsePlaybackOptions {
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  send: (bytes: number[]) => void;
}

/**
 * Schedules a recorded/reference note sequence back out — as real MIDI (if an output device is
 * connected) and as visual keyboard highlighting either way, so it's useful even with no piano
 * plugged in. Ported from the POC's playEvents/stopPlayback (midi-keyboard-poc.html). One playback
 * engine is shared across the reference and every take, distinguished by `playingId` so each
 * caller (ReferencePlayer, a TakeCard) only shows itself as "playing" when it actually is.
 */
export function usePlayback({ noteOn, noteOff, send }: UsePlaybackOptions) {
  const [playing, setPlaying] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activeNotesRef = useRef<Set<number>>(new Set());
  const speedRef = useRef(1);
  speedRef.current = speed;
  const cbRef = useRef({ noteOn, noteOff, send });
  cbRef.current = { noteOn, noteOff, send };
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<{ startedAt: number; totalMs: number } | null>(null); // read every frame by the chart playheads

  const stop = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    progressRef.current = null;
    activeNotesRef.current.forEach((n) => {
      cbRef.current.send([0x80 | PLAYBACK_CHANNEL, n, 0]);
      cbRef.current.noteOff(n);
    });
    activeNotesRef.current.clear();
    setPlaying(false);
    setPlayingId(null);
    setElapsedMs(0);
    setTotalMs(0);
  }, []);

  const play = useCallback(
    (events: NoteEvent[], id: string) => {
      if (!events || events.length === 0) return;
      stop();

      const t0 = Math.min(...events.map((e) => e.onTime)); // start on the first note, not silence before it
      const speedNow = speedRef.current;
      const timeouts: ReturnType<typeof setTimeout>[] = [];

      events.forEach((e) => {
        timeouts.push(
          setTimeout(() => {
            cbRef.current.send([0x90 | PLAYBACK_CHANNEL, e.note, Math.max(1, e.velocity)]);
            cbRef.current.noteOn(e.note, e.velocity);
            activeNotesRef.current.add(e.note);
          }, (e.onTime - t0) / speedNow)
        );
        timeouts.push(
          setTimeout(() => {
            cbRef.current.send([0x80 | PLAYBACK_CHANNEL, e.note, 0]);
            cbRef.current.noteOff(e.note);
            activeNotesRef.current.delete(e.note);
          }, (e.offTime - t0) / speedNow)
        );
      });

      const totalTime = (Math.max(...events.map((e) => e.offTime)) - t0) / speedNow;
      timeouts.push(
        setTimeout(() => {
          timeoutsRef.current = [];
          if (tickRef.current) clearInterval(tickRef.current);
          tickRef.current = null;
          progressRef.current = null;
          setPlaying(false);
          setPlayingId(null);
          setElapsedMs(0);
          setTotalMs(0);
        }, totalTime + 60)
      );

      timeoutsRef.current = timeouts;
      setPlaying(true);
      setPlayingId(id);
      setTotalMs(totalTime);
      setElapsedMs(0);
      const startedAt = performance.now();
      progressRef.current = { startedAt, totalMs: totalTime };
      tickRef.current = setInterval(() => setElapsedMs(Math.min(totalTime, performance.now() - startedAt)), 100);
    },
    [stop]
  );

  const getFraction = useCallback((): number | null => {
    const p = progressRef.current;
    if (!p || p.totalMs <= 0) return null;
    return Math.min(1, (performance.now() - p.startedAt) / p.totalMs);
  }, []);

  return { playing, playingId, speed, setSpeed, play, stop, elapsedMs, totalMs, getFraction };
}
