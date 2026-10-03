"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRhythmRecorder } from "@/hooks/useRhythmRecorder";
import { useClickTrack } from "@/hooks/useClickTrack";
import { useMidiInput } from "@/hooks/useMidiInput";
import { useMidiOutput } from "@/hooks/useMidiOutput";
import { usePlayback } from "@/hooks/usePlayback";
import { computeStats } from "@/lib/stats";
import { gradeDrillTake } from "@/lib/drillGrading";
import { beatIntervalMs } from "@/lib/drillPattern";
import type { GridBeat } from "@/lib/midiParser";
import type { Drill, NoteEvent, Take } from "@/lib/types";
import TakeCard from "./TakeCard";
import PatternTimeline from "./PatternTimeline";
import DrillComparisonReport from "./DrillComparisonReport";
import TakeStatsPanel from "./TakeStatsPanel";
import BeatIndicator from "./BeatIndicator";
import DeleteDrillButton from "./DeleteDrillButton";
import pieceStyles from "./PieceWorkspace.module.css";
import styles from "./DrillWorkspace.module.css";

const COUNT_IN_BARS = 1;

export default function DrillWorkspace({ drill, takes, beats }: { drill: Drill; takes: Take[]; beats: GridBeat[] }) {
  const router = useRouter();
  const recorder = useRhythmRecorder();
  const clickTrack = useClickTrack();
  const output = useMidiOutput();
  const playback = usePlayback({ noteOn: recorder.noteOn, noteOff: recorder.noteOff, send: output.send });

  const [phase, setPhase] = useState<"idle" | "countIn" | "recording">("idle");
  const [clickStartPerfMs, setClickStartPerfMs] = useState<number | null>(null);
  const [pendingTake, setPendingTake] = useState<NoteEvent[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingTakeId, setDeletingTakeId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"practice" | "analysis">("practice");

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  async function saveTake(events: NoteEvent[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const stats = computeStats(events);
      const res = await fetch(`/api/drills/${drill.id}/takes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events, stats }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save take.");
      }
      setPendingTake(null);
      router.refresh();
    } catch (err) {
      setPendingTake(events);
      setSaveError(err instanceof Error ? err.message : "Failed to save take.");
    } finally {
      setSaving(false);
    }
  }

  function handleStartDrill() {
    if (phase !== "idle" || playback.playing) return;
    setPendingTake(null);
    setSaveError(null);
    const handle = clickTrack.start(drill.pattern, COUNT_IN_BARS);
    const countInMs = COUNT_IN_BARS * drill.pattern.timeSignature.numerator * beatIntervalMs(drill.pattern);
    setPhase("countIn");
    setClickStartPerfMs(handle.countInEndPerfMs - countInMs);
    const now = performance.now();
    const t1 = setTimeout(() => {
      setPhase("recording");
      recorder.startRecording(handle.countInEndPerfMs);
    }, Math.max(0, handle.countInEndPerfMs - now));
    const t2 = setTimeout(() => {
      setPhase("idle");
      setClickStartPerfMs(null);
      const events = recorder.stopRecording();
      if (events.length > 0) saveTake(events);
    }, Math.max(0, handle.patternEndPerfMs - now));
    timeoutsRef.current = [t1, t2];
  }

  function handleCancel() {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    clickTrack.stop();
    recorder.discardRecording();
    setPhase("idle");
    setClickStartPerfMs(null);
  }

  const midi = useMidiInput({
    onNoteOn: recorder.noteOn,
    onNoteOff: recorder.noteOff,
    onSustain: () => {},
    onToggleRecording: () => {},
    onTogglePlayReference: () => {},
    interceptControlKeys: false, // every key is a valid tap in a drill — A0/B0 must pass through as real notes
  });

  async function handleDeleteTake(takeId: string) {
    setDeletingTakeId(takeId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/drills/${drill.id}/takes/${takeId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete take.");
      }
      if (selectedTakeId === takeId) setSelectedTakeId(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete take.");
    } finally {
      setDeletingTakeId(null);
    }
  }

  function handleSelectTake(takeId: string) {
    setSelectedTakeId((prev) => {
      const next = prev === takeId ? null : takeId;
      if (next !== null) setActiveTab("analysis");
      return next;
    });
  }

  const selectedTake = takes.find((t) => t.id === selectedTakeId) ?? null;

  const grading = useMemo(() => (selectedTake && selectedTake.events.length ? gradeDrillTake(drill.pattern, selectedTake.events) : null), [selectedTake, drill.pattern]);

  const takeMetrics = useMemo(() => {
    const map = new Map<string, { accuracyPct: number; driftPct: number; netDriftPct: number }>();
    for (const t of takes) {
      if (t.events.length === 0) continue;
      const g = gradeDrillTake(drill.pattern, t.events);
      map.set(t.id, { accuracyPct: g.accuracyPct, driftPct: g.avgDeviationPct, netDriftPct: g.netDeviationPct });
    }
    return map;
  }, [takes, drill.pattern]);

  const getElapsedSinceClickStart = () => (clickStartPerfMs === null ? null : performance.now() - clickStartPerfMs);

  return (
    <div className={pieceStyles.page}>
      <div className={pieceStyles.sidebar}>
        <div className={pieceStyles.sidebarHeader}>
          <a href="/" className={pieceStyles.backLink}>
            ← All pieces &amp; drills
          </a>
          <h1 className={pieceStyles.title}>{drill.name}</h1>
          <div className={pieceStyles.pieceActions}>
            <DeleteDrillButton drillId={drill.id} takeCount={takes.length} />
          </div>
        </div>

        <div className={pieceStyles.refInfoBar}>
          <div>
            {drill.pattern.timeSignature.numerator}/{drill.pattern.timeSignature.denominator} · {drill.pattern.bpm} BPM · {drill.pattern.bars} bars · {drill.pattern.subdivision}
          </div>
          <div className={midi.deviceName ? pieceStyles.statusLive : pieceStyles.status}>
            <span className={pieceStyles.statusDot} />
            {!midi.midiSupported ? "Web MIDI not supported in this browser" : midi.deviceName ? `Listening: ${midi.deviceName}` : "No MIDI device — using virtual keys"}
          </div>
        </div>

        <div className={pieceStyles.sidebarTitle}>Takes ({takes.length})</div>
        {deleteError && <p style={{ color: "var(--danger)", fontSize: 12, marginBottom: 12 }}>{deleteError}</p>}
        {takes.length === 0 ? (
          <div className={pieceStyles.emptyNote}>No takes recorded yet — hit &quot;Start drill&quot; to capture your first one.</div>
        ) : (
          <div className={pieceStyles.takeList}>
            {[...takes]
              .sort((a, b) => b.recordedAt - a.recordedAt)
              .map((take) => (
                <TakeCard
                  key={take.id}
                  take={take}
                  onDelete={handleDeleteTake}
                  deleting={deletingTakeId === take.id}
                  selected={take.id === selectedTakeId}
                  onSelect={handleSelectTake}
                  onPlay={(t) => playback.play(t.events, t.id)}
                  onStopPlayback={playback.stop}
                  isPlaying={playback.playingId === take.id}
                  playDisabled={phase !== "idle"}
                  accuracyPct={takeMetrics.get(take.id)?.accuracyPct}
                  driftPct={takeMetrics.get(take.id)?.driftPct}
                  elapsedMs={playback.elapsedMs}
                  totalMs={playback.totalMs}
                />
              ))}
          </div>
        )}
      </div>

      <div className={pieceStyles.main}>
        <div className={pieceStyles.tabBar}>
          <button className={`${pieceStyles.tabButton} ${activeTab === "practice" ? pieceStyles.tabActive : ""}`} onClick={() => setActiveTab("practice")}>
            Practice
          </button>
          <button className={`${pieceStyles.tabButton} ${activeTab === "analysis" ? pieceStyles.tabActive : ""}`} onClick={() => setActiveTab("analysis")}>
            Analysis
          </button>
        </div>

        {activeTab === "practice" ? (
          <div className={pieceStyles.tabPanel}>
            <BeatIndicator
              active={phase !== "idle"}
              getElapsedMs={getElapsedSinceClickStart}
              beatIntervalMs={beatIntervalMs(drill.pattern)}
              beatsPerBar={drill.pattern.timeSignature.numerator}
            />

            <div className={styles.controls}>
              {phase === "idle" ? (
                <button className={styles.startBtn} onClick={handleStartDrill}>
                  ▶ Start drill
                </button>
              ) : (
                <>
                  <span className={styles.phaseLabel}>{phase === "countIn" ? "Count-in…" : "Recording…"}</span>
                  <button className={styles.cancelBtn} onClick={handleCancel}>
                    Cancel
                  </button>
                </>
              )}
            </div>

            {saveError && (
              <div className={pieceStyles.saveErrorBar}>
                <span>{saveError}</span>
                <button onClick={() => pendingTake && saveTake(pendingTake)} disabled={saving}>
                  {saving ? "Retrying…" : "Retry"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={pieceStyles.tabPanel}>
            {selectedTake && <TakeStatsPanel kind="drill" take={selectedTake} {...takeMetrics.get(selectedTake.id)} />}
            <PatternTimeline
              pattern={drill.pattern}
              beats={beats}
              grading={grading}
              playing={playback.playingId === selectedTake?.id}
              getPlayFraction={playback.getFraction}
            />
            <DrillComparisonReport result={grading} />
          </div>
        )}
      </div>
    </div>
  );
}
