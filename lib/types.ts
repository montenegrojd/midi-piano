export interface NoteEvent {
  note: number; // MIDI note number, 21 (A0) – 108 (C8)
  onTime: number; // ms, relative to the start of the take
  offTime: number; // ms, relative to the start of the take
  velocity: number; // 0-127
  sustained?: boolean; // duration was extended by the sustain pedal rather than the key alone
}

export interface TakeStats {
  noteCount: number;
  totalDuration: string; // seconds, one decimal — kept as a formatted string to match the display
  avgIOI: number; // ms, average gap between consecutive note onsets
  consistencyPct: number; // 0-100, evenness of those gaps (see lib/stats.ts)
  avgVelocity: number;
  avgDuration: number; // ms, average note hold time
  approxBPM: number;
}

export interface Take {
  id: string;
  recordedAt: number; // epoch ms — the sole identifier shown in the UI, no separate name
  events: NoteEvent[];
  stats: TakeStats;
}

export interface MidiChannelInfo {
  program: number | null;
  noteCount: number;
}

export interface Piece {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  referenceMidiFilename: string; // filename within data/midi-library/
  referenceInfo: {
    noteCount: number;
    durationMs: number;
    channels: Record<number, MidiChannelInfo>; // key = 0-indexed MIDI channel
  };
}

export interface PieceSummary {
  id: string;
  name: string;
  createdAt: number;
  referenceMidiFilename: string;
  takeCount: number;
}
