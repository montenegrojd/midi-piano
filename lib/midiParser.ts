import type { NoteEvent } from "./types";

export interface ParsedChannel {
  program: number | null;
  notes: NoteEvent[];
}

export type ParsedMidi = Record<number, ParsedChannel>; // key = 0-indexed MIDI channel

export interface GridBeat {
  ms: number;
  bar: number; // 1-based measure number
  beatInBar: number; // 1-based; 1 is the downbeat
}

export interface ParsedMidiFile {
  channels: ParsedMidi;
  beats: GridBeat[]; // every beat from tick 0 through the last note, for drawing bar lines and beat ticks
  timeSignature: { numerator: number; denominator: number };
}

type RawEvent =
  | { tick: number; type: "tempo"; usPerQuarter: number }
  | { tick: number; type: "timeSig"; numerator: number; denominator: number }
  | { tick: number; type: "program"; channel: number; program: number }
  | { tick: number; type: "noteOn"; note: number; velocity: number; channel: number }
  | { tick: number; type: "noteOff"; note: number; channel: number };

/**
 * Parses a standard MIDI file (SMF, format 0/1/2) from raw bytes into per-channel note events.
 * Ported from the POC (midi-keyboard-poc.html) — works identically in Node and the browser since
 * it only touches the ArrayBuffer, no DOM.
 */
export function parseMidiFile(arrayBuffer: ArrayBuffer): ParsedMidi {
  return parseMidiFileWithGrid(arrayBuffer).channels;
}

export function parseMidiFileWithGrid(arrayBuffer: ArrayBuffer): ParsedMidiFile {
  const view = new DataView(arrayBuffer);
  let pos = 0;
  const readUint32 = () => {
    const v = view.getUint32(pos);
    pos += 4;
    return v;
  };
  const readUint16 = () => {
    const v = view.getUint16(pos);
    pos += 2;
    return v;
  };
  const readUint8 = () => {
    const v = view.getUint8(pos);
    pos += 1;
    return v;
  };
  const readString = (len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(readUint8());
    return s;
  };
  const readVarLen = () => {
    let value = 0;
    let byte: number;
    do {
      byte = readUint8();
      value = (value << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  };

  if (readString(4) !== "MThd") throw new Error("Not a standard MIDI file (missing MThd header)");
  readUint32(); // header length, always 6
  readUint16(); // format (0/1/2) — not needed, tracks are merged either way
  const ntrks = readUint16();
  const division = readUint16();
  if (division & 0x8000) throw new Error("SMPTE time division is not supported");
  const ticksPerQuarter = division;

  const allEvents: RawEvent[] = [];
  for (let t = 0; t < ntrks; t++) {
    if (readString(4) !== "MTrk") throw new Error("Expected MTrk chunk");
    const trackEnd = pos + readUint32();
    let absTick = 0;
    let runningStatus = 0;
    while (pos < trackEnd) {
      absTick += readVarLen();
      let statusByte = view.getUint8(pos);
      if (statusByte & 0x80) {
        pos++;
        runningStatus = statusByte;
      } else {
        statusByte = runningStatus;
      }

      if (statusByte === 0xff) {
        const metaType = readUint8();
        const len = readVarLen();
        if (metaType === 0x51 && len === 3) {
          const usPerQuarter = (readUint8() << 16) | (readUint8() << 8) | readUint8();
          allEvents.push({ tick: absTick, type: "tempo", usPerQuarter });
        } else if (metaType === 0x58 && len >= 2) {
          const numerator = readUint8();
          const denominator = 2 ** readUint8();
          pos += len - 2;
          allEvents.push({ tick: absTick, type: "timeSig", numerator, denominator });
        } else {
          pos += len;
        }
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        pos += readVarLen(); // sysex — skip
      } else {
        const cmd = statusByte & 0xf0;
        const channel = statusByte & 0x0f;
        if (cmd === 0xc0) {
          allEvents.push({ tick: absTick, type: "program", channel, program: readUint8() });
        } else if (cmd === 0xd0) {
          readUint8(); // channel pressure — 1 data byte, not needed
        } else {
          const d1 = readUint8();
          const d2 = readUint8();
          if (cmd === 0x90 && d2 > 0) allEvents.push({ tick: absTick, type: "noteOn", note: d1, velocity: d2, channel });
          else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) allEvents.push({ tick: absTick, type: "noteOff", note: d1, channel });
        }
      }
    }
    pos = trackEnd;
  }

  allEvents.sort((a, b) => a.tick - b.tick);

  // Build a tempo map (default 120 BPM if the file never sets one) and a tick→ms converter
  const tempoChanges = allEvents.filter((e): e is Extract<RawEvent, { type: "tempo" }> => e.type === "tempo");
  if (tempoChanges.length === 0 || tempoChanges[0].tick > 0) tempoChanges.unshift({ tick: 0, usPerQuarter: 500000, type: "tempo" });
  function tickToMs(tick: number) {
    let ms = 0;
    let lastTick = 0;
    let lastTempo = tempoChanges[0].usPerQuarter;
    for (const tc of tempoChanges) {
      if (tc.tick >= tick) break;
      ms += ((tc.tick - lastTick) * (lastTempo / ticksPerQuarter)) / 1000;
      lastTick = tc.tick;
      lastTempo = tc.usPerQuarter;
    }
    ms += ((tick - lastTick) * (lastTempo / ticksPerQuarter)) / 1000;
    return ms;
  }

  // Pair note on/off into NoteEvents, grouped per channel
  const openNotes: Record<string, { onTime: number; velocity: number }[]> = {};
  const programByChannel: Record<number, number> = {};
  const channels: ParsedMidi = {};
  let lastTick = 0;
  allEvents.forEach((e) => {
    if (e.type === "noteOff") lastTick = Math.max(lastTick, e.tick);
    if (e.type === "program") {
      programByChannel[e.channel] = e.program;
    } else if (e.type === "noteOn") {
      const key = `${e.channel}:${e.note}`;
      if (!openNotes[key]) openNotes[key] = [];
      openNotes[key].push({ onTime: tickToMs(e.tick), velocity: e.velocity });
    } else if (e.type === "noteOff") {
      const key = `${e.channel}:${e.note}`;
      const stack = openNotes[key];
      if (stack && stack.length) {
        const entry = stack.shift()!;
        if (!channels[e.channel]) channels[e.channel] = { program: programByChannel[e.channel] ?? null, notes: [] };
        channels[e.channel].notes.push({ note: e.note, onTime: entry.onTime, offTime: tickToMs(e.tick), velocity: entry.velocity });
      }
    }
  });
  Object.values(channels).forEach((c) => c.notes.sort((a, b) => a.onTime - b.onTime));

  // Beat grid from the time-signature map (default 4/4). A beat is one denominator-note; each new
  // signature restarts the measure count's beat position at its own tick.
  const sigChanges = allEvents.filter((e): e is Extract<RawEvent, { type: "timeSig" }> => e.type === "timeSig");
  if (sigChanges.length === 0 || sigChanges[0].tick > 0) sigChanges.unshift({ tick: 0, type: "timeSig", numerator: 4, denominator: 4 });
  const beats: GridBeat[] = [];
  let bar = 0;
  sigChanges.forEach((sig, idx) => {
    const segmentEnd = idx + 1 < sigChanges.length ? sigChanges[idx + 1].tick : lastTick + 1;
    const beatTicks = (ticksPerQuarter * 4) / sig.denominator;
    let beatInBar = 0;
    for (let tick = sig.tick; tick < segmentEnd; tick += beatTicks) {
      if (beatInBar === 0) bar++;
      beats.push({ ms: tickToMs(tick), bar, beatInBar: beatInBar + 1 });
      beatInBar = (beatInBar + 1) % sig.numerator;
    }
  });

  return { channels, beats, timeSignature: { numerator: sigChanges[0].numerator, denominator: sigChanges[0].denominator } };
}

export function summarizeParsedMidi(channels: ParsedMidi) {
  let noteCount = 0;
  let durationMs = 0;
  const summary: Record<number, { program: number | null; noteCount: number }> = {};
  for (const [ch, info] of Object.entries(channels)) {
    noteCount += info.notes.length;
    summary[Number(ch)] = { program: info.program, noteCount: info.notes.length };
    for (const n of info.notes) durationMs = Math.max(durationMs, n.offTime);
  }
  return { noteCount, durationMs, channels: summary };
}
