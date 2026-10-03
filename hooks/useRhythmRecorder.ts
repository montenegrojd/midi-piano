import { useCallback, useRef, useState } from "react";
import type { NoteEvent } from "@/lib/types";

/**
 * A much smaller sibling of usePianoRecorder for rhythm drills: no sustain-pedal handling, no
 * chord-name detection, no active/sustained distinction — pitch is never graded, so this just
 * collects every key-press's onTime (whatever pitch it happens to be). Recording start takes an
 * explicit t0 so the caller can sync it to the exact scheduled click-track moment rather than
 * whenever this function happens to be called.
 */
export function useRhythmRecorder() {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [recording, setRecordingState] = useState(false);

  const activeNotesRef = useRef<Set<number>>(new Set());
  const recordingRef = useRef(false);
  const openNotesRef = useRef<Record<number, { onTime: number; velocity: number }[]>>({});
  const takeEventsRef = useRef<NoteEvent[]>([]);
  const takeStartRef = useRef(0);

  const noteOn = useCallback((note: number, velocity: number) => {
    // A real key can't send note-on twice without releasing first — same duplicate-message guard as usePianoRecorder.
    if (activeNotesRef.current.has(note)) return;
    activeNotesRef.current = new Set(activeNotesRef.current).add(note);
    setActiveNotes(activeNotesRef.current);

    if (recordingRef.current) {
      if (!openNotesRef.current[note]) openNotesRef.current[note] = [];
      openNotesRef.current[note].push({ onTime: performance.now() - takeStartRef.current, velocity });
    }
  }, []);

  const noteOff = useCallback((note: number) => {
    activeNotesRef.current = new Set(activeNotesRef.current);
    activeNotesRef.current.delete(note);
    setActiveNotes(activeNotesRef.current);

    if (recordingRef.current) {
      const stack = openNotesRef.current[note];
      if (stack && stack.length) {
        const entry = stack.shift()!;
        takeEventsRef.current.push({ note, onTime: entry.onTime, offTime: performance.now() - takeStartRef.current, velocity: entry.velocity });
      }
    }
  }, []);

  const startRecording = useCallback((t0?: number) => {
    recordingRef.current = true;
    setRecordingState(true);
    takeStartRef.current = t0 ?? performance.now();
    takeEventsRef.current = [];
    openNotesRef.current = {};
  }, []);

  const stopRecording = useCallback((): NoteEvent[] => {
    recordingRef.current = false;
    setRecordingState(false);

    // close any still-held notes at stop time
    Object.entries(openNotesRef.current).forEach(([n, entries]) => {
      entries.forEach((entry) => {
        takeEventsRef.current.push({ note: Number(n), onTime: entry.onTime, offTime: performance.now() - takeStartRef.current, velocity: entry.velocity });
      });
    });
    openNotesRef.current = {};

    const events = [...takeEventsRef.current].sort((a, b) => a.onTime - b.onTime);
    takeEventsRef.current = [];
    return events;
  }, []);

  const discardRecording = useCallback(() => {
    recordingRef.current = false;
    setRecordingState(false);
    openNotesRef.current = {};
    takeEventsRef.current = [];
  }, []);

  return { activeNotes, recording, noteOn, noteOff, startRecording, stopRecording, discardRecording };
}
