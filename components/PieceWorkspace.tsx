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
import { compareTakeToReference } from "@/lib/comparison";
import type { ParsedMidi } from "@/lib/midiParser";
import type { NoteEvent, Piece, Take } from "@/lib/types";
import Keyboard from "./Keyboard";
import TakeCard from "./TakeCard";
import ReferencePlayer from "./ReferencePlayer";
import CombinedTimeline from "./CombinedTimeline";
import VelocityChart from "./VelocityChart";
import TimingDeviationChart from "./TimingDeviationChart";
import ComparisonReport from "./ComparisonReport";
import styles from "./PieceWorkspace.module.css";

function formatTimer(ms: number) {
  const secs = Math.floor(ms / 1000);
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function defaultPianoChannels(channels: ParsedMidi): Set<number> {
  const initial = new Set<number>();
  Object.entries(channels).forEach(([ch, info]) => {
    if (info.notes.length === 0) return;
    if (channelInstrumentName(Number(ch), info.program).toLowerCase().includes("piano")) initial.add(Number(ch));
  });
  return initial;
}

export default function PieceWorkspace({ piece, takes, referenceChannels }: { piece: Piece; takes: Take[]; referenceChannels: ParsedMidi }) {
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

  const takeAccuracies = useMemo(() => {
    const map = new Map<string, number>();
    if (selectedReferenceEvents.length === 0) return map;
    for (const take of takes) {
      if (take.events.length === 0) continue;
      map.set(take.id, compareTakeToReference(selectedReferenceEvents, take.events).accuracyPct);
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

  const midi = useMidiInput({
    onNoteOn: recorder.noteOn,
    onNoteOff: recorder.noteOff,
    onSustain: recorder.setSustain,
    onToggleRecording: handleToggleRecording,
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
    setSelectedTakeId((prev) => (prev === takeId ? null : takeId));
  }

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
                  accuracyPct={takeAccuracies.get(take.id)}
                />
              ))}
          </div>
        )}
      </div>

      <div className={styles.main}>
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

        <CombinedTimeline
          referenceEvents={selectedReferenceEvents}
          takeEvents={selectedTake?.events ?? null}
          takeLabel={selectedTake ? new Date(selectedTake.recordedAt).toLocaleString() : undefined}
          comparison={comparison}
        />
        <VelocityChart referenceEvents={selectedReferenceEvents} takeEvents={selectedTake?.events ?? null} />
        <TimingDeviationChart referenceEvents={selectedReferenceEvents} takeEvents={selectedTake?.events ?? null} comparison={comparison} />
        <ComparisonReport result={comparison} />

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
    </div>
  );
}
