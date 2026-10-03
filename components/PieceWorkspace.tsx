"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePianoRecorder } from "@/hooks/usePianoRecorder";
import { useMidiInput } from "@/hooks/useMidiInput";
import { useMidiOutput } from "@/hooks/useMidiOutput";
import { usePlayback } from "@/hooks/usePlayback";
import { computeStats } from "@/lib/stats";
import { midiToName } from "@/lib/chords";
import { channelInstrumentName } from "@/lib/gmInstruments";
import { compareTakeToReference, computeTimingDeviations } from "@/lib/comparison";
import { formatTimer } from "@/lib/format";
import type { GridBeat, ParsedMidi } from "@/lib/midiParser";
import type { NoteEvent, Piece, Take } from "@/lib/types";
import Keyboard from "./Keyboard";
import StaffView from "./StaffView";
import TakeCard from "./TakeCard";
import ReferencePlayer from "./ReferencePlayer";
import CombinedTimeline from "./CombinedTimeline";
import VelocityChart from "./VelocityChart";
import TimingDeviationChart from "./TimingDeviationChart";
import ComparisonReport from "./ComparisonReport";
import TakeStatsPanel from "./TakeStatsPanel";
import { computeTakeInsights } from "@/lib/takeInsights";
import DeletePieceButton from "./DeletePieceButton";
import styles from "./PieceWorkspace.module.css";

function defaultPianoChannels(channels: ParsedMidi): Set<number> {
  const initial = new Set<number>();
  Object.entries(channels).forEach(([ch, info]) => {
    if (info.notes.length === 0) return;
    if (channelInstrumentName(Number(ch), info.program).toLowerCase().includes("piano")) initial.add(Number(ch));
  });
  return initial;
}

export default function PieceWorkspace({ piece, takes, referenceChannels, beats }: { piece: Piece; takes: Take[]; referenceChannels: ParsedMidi; beats: GridBeat[] }) {
  const router = useRouter();
  const recorder = usePianoRecorder();
  const output = useMidiOutput();
  const playback = usePlayback({ noteOn: recorder.noteOn, noteOff: recorder.noteOff, send: output.send });

  const [pendingTake, setPendingTake] = useState<NoteEvent[] | null>(null); // only set if an auto-save failed, so Retry can resend it
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingTakeId, setDeletingTakeId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"play" | "analysis">("play");
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(() => defaultPianoChannels(referenceChannels));

  function toggleChannel(channel: number) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  const selectedReferenceEvents = useMemo(() => {
    const merged: NoteEvent[] = [];
    selectedChannels.forEach((ch) => merged.push(...(referenceChannels[ch]?.notes ?? [])));
    return merged.sort((a, b) => a.onTime - b.onTime);
  }, [selectedChannels, referenceChannels]);

  const selectedTake = takes.find((t) => t.id === selectedTakeId) ?? null;

  const comparison = useMemo(() => {
    if (!selectedTake || selectedReferenceEvents.length === 0 || selectedTake.events.length === 0) return null;
    return compareTakeToReference(selectedReferenceEvents, selectedTake.events);
  }, [selectedReferenceEvents, selectedTake]);

  const insights = useMemo(() => {
    if (!selectedTake || !comparison) return null;
    return computeTakeInsights(comparison, selectedReferenceEvents, selectedTake.events, beats);
  }, [comparison, selectedReferenceEvents, selectedTake, beats]);

  const takeMetrics = useMemo(() => {
    const map = new Map<string, { accuracyPct: number; driftPct: number | null; netDriftPct: number | null }>();
    if (selectedReferenceEvents.length === 0) return map;
    for (const take of takes) {
      if (take.events.length === 0) continue;
      const result = compareTakeToReference(selectedReferenceEvents, take.events);
      const points = computeTimingDeviations(result.steps, selectedReferenceEvents, take.events);
      // Average size of the bars in the Timing drift chart, as a % of the piece (sign ignored).
      const driftPct = points.length ? (points.reduce((a, p) => a + Math.abs(p.deviation), 0) / points.length) * 100 : null;
      // Signed version of the same bars: positive = behind the reference's pace (dragging), negative = ahead (rushing).
      const netDriftPct = points.length ? (points.reduce((a, p) => a + p.deviation, 0) / points.length) * 100 : null;
      map.set(take.id, { accuracyPct: result.accuracyPct, driftPct, netDriftPct });
    }
    return map;
  }, [selectedReferenceEvents, takes]);

  async function saveTake(events: NoteEvent[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const stats = computeStats(events);
      const res = await fetch(`/api/pieces/${piece.id}/takes`, {
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
      setPendingTake(events); // keep the captured notes so Retry can resend them
      setSaveError(err instanceof Error ? err.message : "Failed to save take.");
    } finally {
      setSaving(false);
    }
  }

  function handleToggleRecording() {
    if (playback.playing) return; // recording and playback are mutually exclusive
    if (recorder.recording) {
      const events = recorder.stopRecording();
      if (events.length === 0) return; // nothing captured
      saveTake(events); // auto-save immediately, no naming step — A0 alone starts and finishes a take
    } else {
      setPendingTake(null);
      setSaveError(null);
      recorder.startRecording();
    }
  }

  function handleTogglePlayReference() {
    if (recorder.recording) return; // don't start playback over a live take
    if (playback.playingId === "reference") playback.stop();
    else playback.play(selectedReferenceEvents, "reference");
  }

  const midi = useMidiInput({
    onNoteOn: recorder.noteOn,
    onNoteOff: recorder.noteOff,
    onSustain: recorder.setSustain,
    onToggleRecording: handleToggleRecording,
    onTogglePlayReference: handleTogglePlayReference,
  });

  async function handleDeleteTake(takeId: string) {
    setDeletingTakeId(takeId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/pieces/${piece.id}/takes/${takeId}`, { method: "DELETE" });
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

  // Which timeline the playhead runs on: the reference's, or the selected take's (a take playing
  // that isn't the one being analysed has nothing to show on these charts).
  const playingAxis: "reference" | "take" | null =
    playback.playingId === "reference" ? "reference" : selectedTake && playback.playingId === selectedTake.id ? "take" : null;

  const audibleNotes = [...new Set([...recorder.activeNotes, ...recorder.sustainedNotes])].sort((a, b) => a - b);
  const referenceDurationSecs = (piece.referenceInfo.durationMs / 1000).toFixed(1);

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <a href="/" className={styles.backLink}>
            ← All pieces
          </a>
          <h1 className={styles.title}>{piece.name}</h1>
          <div className={styles.pieceActions}>
            <DeletePieceButton pieceId={piece.id} takeCount={takes.length} />
          </div>
        </div>

        <div className={styles.refInfoBar}>
          <div>
            Reference: {piece.referenceMidiFilename} · {piece.referenceInfo.noteCount} notes · {referenceDurationSecs}s
          </div>
          <div className={midi.deviceName ? styles.statusLive : styles.status}>
            <span className={styles.statusDot} />
            {!midi.midiSupported ? "Web MIDI not supported in this browser" : midi.deviceName ? `Listening: ${midi.deviceName}` : "No MIDI device — using virtual keys"}
          </div>
        </div>

        <ReferencePlayer
          channels={referenceChannels}
          playing={playback.playingId === "reference"}
          speed={playback.speed}
          onSpeedChange={playback.setSpeed}
          onPlay={() => playback.play(selectedReferenceEvents, "reference")}
          onStop={playback.stop}
          disabled={recorder.recording}
          outputDeviceName={output.deviceName}
          selectedChannels={selectedChannels}
          onToggleChannel={toggleChannel}
          elapsedMs={playback.elapsedMs}
          totalMs={playback.totalMs}
        />

        <div className={styles.sidebarTitle}>Takes ({takes.length})</div>
        {deleteError && <p style={{ color: "var(--danger)", fontSize: 12, marginBottom: 12 }}>{deleteError}</p>}
        {takes.length === 0 ? (
          <div className={styles.emptyNote}>No takes recorded yet — hit &quot;Record take&quot; to capture your first one.</div>
        ) : (
          <div className={styles.takeList}>
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
                  playDisabled={recorder.recording}
                  accuracyPct={takeMetrics.get(take.id)?.accuracyPct}
                  driftPct={takeMetrics.get(take.id)?.driftPct ?? undefined}
                  elapsedMs={playback.elapsedMs}
                  totalMs={playback.totalMs}
                />
              ))}
          </div>
        )}
      </div>

      <div className={styles.main}>
        <div className={styles.tabBar}>
          <button className={`${styles.tabButton} ${activeTab === "play" ? styles.tabActive : ""}`} onClick={() => setActiveTab("play")}>
            Play &amp; capture
          </button>
          <button className={`${styles.tabButton} ${activeTab === "analysis" ? styles.tabActive : ""}`} onClick={() => setActiveTab("analysis")}>
            Analysis
          </button>
        </div>

        {activeTab === "play" ? (
          <div className={styles.tabPanel}>
            <div className={styles.pianoRow}>
              <div className={styles.keyboardCol}>
              <div className={styles.chordName}>{recorder.chordName}</div>

              <div className={styles.readout}>
                {audibleNotes.length === 0 ? (
                  <span className={styles.placeholder}>Play a note — click a key on the keyboard, or connect a MIDI device</span>
                ) : (
                  audibleNotes.map((n) => (
                    <span className={styles.noteTag} key={n}>
                      {midiToName(n)}
                    </span>
                  ))
                )}
              </div>

                <Keyboard activeNotes={recorder.activeNotes} sustainedNotes={recorder.sustainedNotes} onPress={midi.pressVirtualKey} onRelease={midi.releaseVirtualKey} />
                <div className={`${styles.pedalStatus} ${recorder.sustainOn ? styles.on : ""}`}>
                  <span className={styles.pedalDot} />
                  Sustain
                </div>
              </div>

              <StaffView activeNotes={audibleNotes} />
            </div>

            {recorder.recording && (
              <div className={styles.recBar}>
                <span className={styles.recTimer}>{formatTimer(recorder.elapsedMs)}</span>
              </div>
            )}

            {saveError && (
              <div className={styles.saveErrorBar}>
                <span>{saveError}</span>
                <button onClick={() => pendingTake && saveTake(pendingTake)} disabled={saving}>
                  {saving ? "Retrying…" : "Retry"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.tabPanel}>
            {selectedTake && <TakeStatsPanel take={selectedTake} insights={insights} {...takeMetrics.get(selectedTake.id)} driftPct={takeMetrics.get(selectedTake.id)?.driftPct ?? undefined} netDriftPct={takeMetrics.get(selectedTake.id)?.netDriftPct ?? undefined} />}
            <CombinedTimeline
              referenceEvents={selectedReferenceEvents}
              takeEvents={selectedTake?.events ?? null}
              takeLabel={selectedTake ? new Date(selectedTake.recordedAt).toLocaleString() : undefined}
              comparison={comparison}
              beats={beats}
              playing={playingAxis !== null}
              getPlayFraction={playback.getFraction}
            />
            <VelocityChart referenceEvents={selectedReferenceEvents} takeEvents={selectedTake?.events ?? null} beats={beats} playing={playingAxis !== null} getPlayFraction={playback.getFraction} />
            <TimingDeviationChart referenceEvents={selectedReferenceEvents} takeEvents={selectedTake?.events ?? null} comparison={comparison} beats={beats} playing={playingAxis !== null} playingAxis={playingAxis ?? undefined} getPlayFraction={playback.getFraction} />
            <ComparisonReport result={comparison} />
          </div>
        )}
      </div>
    </div>
  );
}
