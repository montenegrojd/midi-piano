"use client";

import { useMemo, useState } from "react";
import type { ParsedMidi } from "@/lib/midiParser";
import { channelInstrumentName } from "@/lib/gmInstruments";
import styles from "./ReferencePlayer.module.css";

interface ReferencePlayerProps {
  channels: ParsedMidi;
  playing: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
  outputDeviceName: string | null;
  selectedChannels: Set<number>;
  onToggleChannel: (channel: number) => void;
}

/**
 * Lets you pick which parts of the reference .mid to hear (these files bundle a full backing
 * arrangement — drums, bass, chords — not just the piano part) and play them back. Channel
 * selection is owned by the parent (PieceWorkspace) so the combined timeline can share it.
 */
export default function ReferencePlayer({
  channels,
  playing,
  speed,
  onSpeedChange,
  onPlay,
  onStop,
  disabled,
  outputDeviceName,
  selectedChannels,
  onToggleChannel,
}: ReferencePlayerProps) {
  const [collapsed, setCollapsed] = useState(false);

  const entries = useMemo(
    () =>
      Object.entries(channels)
        .map(([ch, info]) => ({ channel: Number(ch), ...info }))
        .filter((c) => c.notes.length > 0)
        .sort((a, b) => a.channel - b.channel),
    [channels]
  );

  function handlePlayToggle() {
    if (playing) onStop();
    else onPlay();
  }

  if (entries.length === 0) return null;

  return (
    <div className={styles.card}>
      <button className={styles.title} onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
        <span className={styles.disclosure}>{collapsed ? "▸" : "▾"}</span>
        Reference channels
        <span className={styles.titleCount}>
          ({selectedChannels.size}/{entries.length} selected)
        </span>
      </button>
      {!collapsed && (
        <div className={styles.channelList}>
          {entries.map((c) => (
            <label key={c.channel} className={styles.channelRow}>
              <input type="checkbox" checked={selectedChannels.has(c.channel)} onChange={() => onToggleChannel(c.channel)} disabled={playing} />
              Ch {c.channel + 1} — {channelInstrumentName(c.channel, c.program)} — {c.notes.length} notes
            </label>
          ))}
        </div>
      )}
      <div className={styles.controls}>
        <button className={styles.playBtn} onClick={handlePlayToggle} disabled={disabled || selectedChannels.size === 0}>
          {playing ? "■ Stop" : "▶ Play reference"}
        </button>
        <label className={styles.speedLabel}>
          Speed
          <select value={speed} onChange={(e) => onSpeedChange(parseFloat(e.target.value))} disabled={playing}>
            <option value={0.25}>0.25×</option>
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
          </select>
        </label>
        <span className={styles.outputHint}>{outputDeviceName ? `Output: ${outputDeviceName}` : "No output device — visual only"}</span>
      </div>
    </div>
  );
}
