import { useEffect, useRef, useState } from "react";
import { PLAY_REFERENCE_NOTE, RECORD_TOGGLE_NOTE } from "@/lib/constants";

interface UseMidiInputOptions {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onSustain: (down: boolean) => void;
  onToggleRecording: () => void;
  onTogglePlayReference: () => void;
  /** Set false on pages where every key is meaningful input (e.g. a rhythm drill, where any key is
   * a valid tap) so A0/B0 pass through as real notes instead of being swallowed as controls. Default true. */
  interceptControlKeys?: boolean;
}

/**
 * Wires all input sources (real MIDI device, on-screen key clicks, and A0 as a hands-free record
 * toggle, B1 as a hands-free play/stop for the reference) into a piano note/sustain/recording controller — ported from the POC's Web MIDI section
 * (midi-keyboard-poc.html). Sustain only comes from a real pedal (MIDI CC 64) now.
 */
export function useMidiInput({ onNoteOn, onNoteOff, onSustain, onToggleRecording, onTogglePlayReference, interceptControlKeys = true }: UseMidiInputOptions) {
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [midiSupported, setMidiSupported] = useState(true);

  // Always-fresh callbacks for the event handler below, which is attached once outside React's render cycle.
  const cbRef = useRef({ onNoteOn, onNoteOff, onSustain, onToggleRecording, onTogglePlayReference, interceptControlKeys });
  cbRef.current = { onNoteOn, onNoteOff, onSustain, onToggleRecording, onTogglePlayReference, interceptControlKeys };

  // A0 and B1 are control keys: they trigger an action instead of being played/recorded as notes —
  // unless interceptControlKeys is off, in which case every key is real input.
  const tryControlKey = (note: number) => {
    if (!cbRef.current.interceptControlKeys) return false;
    if (note === RECORD_TOGGLE_NOTE) cbRef.current.onToggleRecording();
    else if (note === PLAY_REFERENCE_NOTE) cbRef.current.onTogglePlayReference();
    else return false;
    return true;
  };
  const isControlKey = (note: number) => cbRef.current.interceptControlKeys && (note === RECORD_TOGGLE_NOTE || note === PLAY_REFERENCE_NOTE);

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
        if (!tryControlKey(d1)) cbRef.current.onNoteOn(d1, d2);
      } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
        if (!isControlKey(d1)) cbRef.current.onNoteOff(d1);
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
    if (!tryControlKey(note)) cbRef.current.onNoteOn(note, 100);
  };
  const releaseVirtualKey = (note: number) => {
    if (!isControlKey(note)) cbRef.current.onNoteOff(note);
  };

  return { deviceName, midiSupported, pressVirtualKey, releaseVirtualKey };
}
