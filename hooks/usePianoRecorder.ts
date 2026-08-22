import { useCallback, useEffect, useRef, useState } from "react";
import { detectChord } from "@/lib/chords";
import type { NoteEvent } from "@/lib/types";

interface OpenEntry {
  onTime: number;
  velocity: number;
}

/**
 * Owns all piano note/sustain/recording state for one Piece page. Ported from the POC's
 * noteOn/noteOff/setSustain + recording-layer overrides (midi-keyboard-poc.html), rearchitected
 * from direct DOM manipulation into React state.
 *
 * "Live" refs mirror the reactive state so the Web MIDI event handler (attached once, outside
 * React's render cycle) always reads current values instead of a stale closure.
 */
export function usePianoRecorder() {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainOn, setSustainOnState] = useState(false);
  const [chordName, setChordName] = useState("");
  const [recording, setRecordingState] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const activeNotesRef = useRef<Set<number>>(new Set());
  const sustainedNotesRef = useRef<Set<number>>(new Set());
  const sustainOnRef = useRef(false);
  const recordingRef = useRef(false);

  const openNotesRef = useRef<Record<number, OpenEntry[]>>({});
  const sustainedOpenRef = useRef<Record<number, OpenEntry[]>>({});
  const takeEventsRef = useRef<NoteEvent[]>([]);
  const takeStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recomputeChord = useCallback(() => {
    const all = new Set<number>([...activeNotesRef.current, ...sustainedNotesRef.current]);
    setChordName(all.size >= 2 ? detectChord([...all]) : "");
  }, []);

  const noteOn = useCallback(
    (note: number, velocity: number) => {
      activeNotesRef.current = new Set(activeNotesRef.current).add(note);
      setActiveNotes(activeNotesRef.current);
      if (sustainedNotesRef.current.has(note)) {
        sustainedNotesRef.current = new Set(sustainedNotesRef.current);
        sustainedNotesRef.current.delete(note);
        setSustainedNotes(sustainedNotesRef.current);
      }
      recomputeChord();

      if (recordingRef.current) {
        const pending = sustainedOpenRef.current[note];
        if (pending && pending.length) {
          // re-pressing a note that was only ringing via the pedal finalizes it right now
          const entry = pending.shift()!;
          takeEventsRef.current.push({
            note,
            onTime: entry.onTime,
            offTime: performance.now() - takeStartRef.current,
            velocity: entry.velocity,
            sustained: true,
          });
        }
        if (!openNotesRef.current[note]) openNotesRef.current[note] = [];
        openNotesRef.current[note].push({ onTime: performance.now() - takeStartRef.current, velocity });
      }
    },
    [recomputeChord]
  );

  const noteOff = useCallback(
    (note: number) => {
      activeNotesRef.current = new Set(activeNotesRef.current);
      activeNotesRef.current.delete(note);
      setActiveNotes(activeNotesRef.current);

      if (sustainOnRef.current) {
        // key released, but the pedal is down — keep it "ringing", not "pressed"
        sustainedNotesRef.current = new Set(sustainedNotesRef.current).add(note);
        setSustainedNotes(sustainedNotesRef.current);
      } else if (sustainedNotesRef.current.has(note)) {
        sustainedNotesRef.current = new Set(sustainedNotesRef.current);
        sustainedNotesRef.current.delete(note);
        setSustainedNotes(sustainedNotesRef.current);
      }
      recomputeChord();

      if (recordingRef.current) {
        const stack = openNotesRef.current[note];
        if (stack && stack.length) {
          const entry = stack.shift()!;
          if (sustainOnRef.current) {
            // key released, but the pedal keeps it ringing — don't finalize the duration yet
            if (!sustainedOpenRef.current[note]) sustainedOpenRef.current[note] = [];
            sustainedOpenRef.current[note].push(entry);
          } else {
            takeEventsRef.current.push({
              note,
              onTime: entry.onTime,
              offTime: performance.now() - takeStartRef.current,
              velocity: entry.velocity,
            });
          }
        }
      }
    },
    [recomputeChord]
  );

  const setSustain = useCallback(
    (down: boolean) => {
      const wasOn = sustainOnRef.current;
      sustainOnRef.current = down;
      setSustainOnState(down);

      if (wasOn && !down) {
        // pedal released — let go of any notes that aren't still physically held
        sustainedNotesRef.current = new Set([...sustainedNotesRef.current].filter((n) => activeNotesRef.current.has(n)));
        setSustainedNotes(sustainedNotesRef.current);
        recomputeChord();

        if (recordingRef.current) {
          Object.entries(sustainedOpenRef.current).forEach(([n, entries]) => {
            entries.forEach((entry) => {
              takeEventsRef.current.push({
                note: Number(n),
                onTime: entry.onTime,
                offTime: performance.now() - takeStartRef.current,
                velocity: entry.velocity,
                sustained: true,
              });
            });
          });
          sustainedOpenRef.current = {};
        }
      }
    },
    [recomputeChord]
  );

  const startRecording = useCallback(() => {
    recordingRef.current = true;
    setRecordingState(true);
    takeStartRef.current = performance.now();
    takeEventsRef.current = [];
    openNotesRef.current = {};
    sustainedOpenRef.current = {};
    const t0 = Date.now();
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 250);
  }, []);

  const stopRecording = useCallback((): NoteEvent[] => {
    recordingRef.current = false;
    setRecordingState(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsedMs(0);

    // close any still-held notes at stop time (physically held, and any still ringing via the pedal)
    Object.entries(openNotesRef.current).forEach(([n, entries]) => {
      entries.forEach((entry) => {
        takeEventsRef.current.push({
          note: Number(n),
          onTime: entry.onTime,
          offTime: performance.now() - takeStartRef.current,
          velocity: entry.velocity,
        });
      });
    });
    openNotesRef.current = {};
    Object.entries(sustainedOpenRef.current).forEach(([n, entries]) => {
      entries.forEach((entry) => {
        takeEventsRef.current.push({
          note: Number(n),
          onTime: entry.onTime,
          offTime: performance.now() - takeStartRef.current,
          velocity: entry.velocity,
          sustained: true,
        });
      });
    });
    sustainedOpenRef.current = {};

    const events = [...takeEventsRef.current].sort((a, b) => a.onTime - b.onTime);
    takeEventsRef.current = [];
    return events;
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  return {
    activeNotes,
    sustainedNotes,
    sustainOn,
    chordName,
    recording,
    elapsedMs,
    noteOn,
    noteOff,
    setSustain,
    startRecording,
    stopRecording,
  };
}
