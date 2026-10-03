"use client";

import { useEffect, useRef, useState } from "react";
import { decodeMidiMessage, hex, type DecodedMessage } from "@/lib/midiDecode";
import styles from "./MidiDiagnostics.module.css";

interface LogEntry extends DecodedMessage {
  id: number;
  time: string;
  port: string;
  raw: string;
}

interface PortInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

const MAX_LOG = 500;
const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

export default function MidiDiagnostics() {
  const [supported, setSupported] = useState(true);
  const [sysexGranted, setSysexGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<PortInfo[]>([]);
  const [outputs, setOutputs] = useState<PortInfo[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [hideNoise, setHideNoise] = useState(true);
  const [paused, setPaused] = useState(false);
  const [noiseCount, setNoiseCount] = useState(0);

  const accessRef = useRef<MIDIAccess | null>(null);
  const idRef = useRef(0);
  const hideNoiseRef = useRef(hideNoise);
  hideNoiseRef.current = hideNoise;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      setSupported(false);
      return;
    }
    let cancelled = false;

    function handleMessage(port: string) {
      return (event: MIDIMessageEvent) => {
        if (!event.data || pausedRef.current) return;
        const decoded = decodeMidiMessage(event.data);
        // Pianos constantly send active sensing / clock; hide by default so real messages stay visible.
        if (hideNoiseRef.current && decoded.kind === "realtime" && (event.data[0] === 0xfe || event.data[0] === 0xf8)) {
          setNoiseCount((n) => n + 1);
          return;
        }
        const entry: LogEntry = { ...decoded, id: idRef.current++, time: new Date().toLocaleTimeString([], { hour12: false }), port, raw: hex(event.data) };
        setLog((prev) => [entry, ...prev].slice(0, MAX_LOG));
      };
    }

    function refresh(access: MIDIAccess) {
      const toInfo = (p: MIDIPort): PortInfo => ({ id: p.id, name: p.name ?? "(unnamed)", manufacturer: p.manufacturer ?? "", state: p.state });
      const ins = Array.from(access.inputs.values());
      const outs = Array.from(access.outputs.values());
      ins.forEach((input) => {
        input.onmidimessage = handleMessage(input.name ?? input.id); // every input, not just the first — this is a diagnostic
      });
      setInputs(ins.map(toInfo));
      setOutputs(outs.map(toInfo));
      setSelectedOutputId((prev) => (prev && outs.some((o) => o.id === prev) ? prev : (outs[0]?.id ?? "")));
    }

    async function init() {
      let access: MIDIAccess;
      try {
        access = await navigator.requestMIDIAccess({ sysex: true });
        if (!cancelled) setSysexGranted(true);
      } catch {
        try {
          access = await navigator.requestMIDIAccess();
          if (!cancelled) setSysexGranted(false);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "MIDI access was denied.");
          return;
        }
      }
      if (cancelled) return;
      accessRef.current = access;
      refresh(access);
      access.onstatechange = () => refresh(access);
    }
    init();

    return () => {
      cancelled = true;
      accessRef.current?.inputs.forEach((i) => (i.onmidimessage = null));
      if (accessRef.current) accessRef.current.onstatechange = null;
    };
  }, []);

  function sendIdentityRequest() {
    const out = accessRef.current?.outputs.get(selectedOutputId);
    if (!out) return;
    out.send(IDENTITY_REQUEST);
    const entry: LogEntry = {
      id: idRef.current++,
      time: new Date().toLocaleTimeString([], { hour12: false }),
      port: out.name ?? out.id,
      kind: "sysex",
      text: "Sent: Identity request (asks the piano for its manufacturer/model)",
      raw: hex(IDENTITY_REQUEST),
    };
    setLog((prev) => [entry, ...prev].slice(0, MAX_LOG));
  }

  const kindClass = (k: DecodedMessage["kind"]) => (k === "sysex" ? styles.sysex : k === "cc" || k === "program" ? styles.control : "");

  return (
    <div className={styles.page}>
      <a href="/" className={styles.backLink}>
        ← All pieces
      </a>
      <h1 className={styles.title}>MIDI diagnostics</h1>

      {!supported && <p className={styles.error}>Web MIDI isn&apos;t supported in this browser (try Chrome or Edge).</p>}
      {error && <p className={styles.error}>{error}</p>}
      {sysexGranted === false && <p className={styles.warning}>SysEx permission wasn&apos;t granted — basic messages will show, but identity requests/replies and other SysEx need it. Reload and allow the prompt.</p>}

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>Inputs ({inputs.length})</h2>
          {inputs.length === 0 ? <p className={styles.muted}>None detected.</p> : inputs.map((p) => <PortRow key={p.id} port={p} />)}
        </section>
        <section className={styles.panel}>
          <h2>Outputs ({outputs.length})</h2>
          {outputs.length === 0 ? <p className={styles.muted}>None detected.</p> : outputs.map((p) => <PortRow key={p.id} port={p} />)}
        </section>
      </div>

      <section className={styles.panel}>
        <h2>Ask the piano who it is</h2>
        <p className={styles.muted}>Sends a standard Identity Request (read-only — it changes nothing). Pianos that support it reply with manufacturer and model codes.</p>
        <div className={styles.row}>
          <select value={selectedOutputId} onChange={(e) => setSelectedOutputId(e.target.value)} disabled={outputs.length === 0}>
            {outputs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button className={styles.btn} onClick={sendIdentityRequest} disabled={!selectedOutputId || sysexGranted !== true}>
            Send identity request
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.logHeader}>
          <h2>Message log</h2>
          <label className={styles.check}>
            <input type="checkbox" checked={hideNoise} onChange={(e) => setHideNoise(e.target.checked)} /> hide active sensing / clock{noiseCount > 0 ? ` (${noiseCount} hidden)` : ""}
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> pause
          </label>
          <button className={styles.btnSmall} onClick={() => { setLog([]); setNoiseCount(0); }}>
            clear
          </button>
        </div>
        <p className={styles.muted}>Press keys, pedals, and panel buttons on the piano — change the voice, reverb, or metronome — and see what (if anything) it sends.</p>
        <div className={styles.log}>
          {log.length === 0 ? (
            <p className={styles.muted}>Nothing received yet.</p>
          ) : (
            log.map((e) => (
              <div key={e.id} className={`${styles.entry} ${kindClass(e.kind)}`}>
                <span className={styles.time}>{e.time}</span>
                <span className={styles.text}>{e.text}</span>
                <span className={styles.raw}>{e.raw}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function PortRow({ port }: { port: PortInfo }) {
  return (
    <div className={styles.port}>
      <div>{port.name}</div>
      <div className={styles.muted}>
        {port.manufacturer || "unknown manufacturer"} · {port.state}
      </div>
    </div>
  );
}
