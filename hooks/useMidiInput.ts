import { useEffect, useRef, useState } from "react";
import { RECORD_TOGGLE_NOTE } from "@/lib/constants";

interface UseMidiInputOptions {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onSustain: (down: boolean) => void;
  onToggleRecording: () => void;
}

/**
 * Wires all input sources (real MIDI device, on-screen key clicks, and A0 as a hands-free record
 * toggle) into a piano note/sustain/recording controller — ported from the POC's Web MIDI section
 * (midi-keyboard-poc.html). Sustain only comes from a real pedal (MIDI CC 64) now.
 */
export function useMidiInput({ onNoteOn, onNoteOff, onSustain, onToggleRecording }: UseMidiInputOptions) {
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [midiSupported, setMidiSupported] = useState(true);

  // Always-fresh callbacks for the event handler below, which is attached once outside React's render cycle.
  const cbRef = useRef({ onNoteOn, onNoteOff, onSustain, onToggleRecording });
  cbRef.current = { onNoteOn, onNoteOff, onSustain, onToggleRecording };

  const tryToggleRecording = (note: number) => {
    if (note !== RECORD_TOGGLE_NOTE) return false;
    cbRef.current.onToggleRecording();
    return true;
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      setMidiSupported(false);
      return;
    }
    let currentInput: MIDIInput | null = null;

    function handleMessage(event: MIDIMessageEvent) {
      const data = event.data;
      if (!data || data.length < 2) return;
      const [status, d1, d2 = 0] = data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && d2 > 0) {
        if (!tryToggleRecording(d1)) cbRef.current.onNoteOn(d1, d2);
      } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
        if (d1 !== RECORD_TOGGLE_NOTE) cbRef.current.onNoteOff(d1);
      } else if (cmd === 0xb0 && d1 === 64) {
        cbRef.current.onSustain(d2 >= 64);
      }
    }

    function attach(input: MIDIInput | undefined) {
      if (currentInput) currentInput.onmidimessage = null;
      currentInput = input ?? null;
      if (input) {
        input.onmidimessage = handleMessage;
        setDeviceName(input.name ?? "MIDI device");
      } else {
        setDeviceName(null);
      }
    }

    navigator
      .requestMIDIAccess()
      .then((access) => {
        const refresh = () => attach(Array.from(access.inputs.values())[0]);
        refresh();
        access.onstatechange = refresh;
      })
      .catch(() => setMidiSupported(false));

    return () => {
      if (currentInput) currentInput.onmidimessage = null;
    };
  }, []);

  const pressVirtualKey = (note: number) => {
    if (!tryToggleRecording(note)) cbRef.current.onNoteOn(note, 100);
  };
  const releaseVirtualKey = (note: number) => cbRef.current.onNoteOff(note);

  return { deviceName, midiSupported, pressVirtualKey, releaseVirtualKey };
}
