import { useEffect, useRef, useState } from "react";

/**
 * Auto-selects the first available MIDI output device and exposes a raw `send`. Mirrors
 * useMidiInput's device-handling pattern, but for output — ported from the POC's
 * attachOutput/refreshOutputList (midi-keyboard-poc.html).
 */
export function useMidiOutput() {
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const outputRef = useRef<MIDIOutput | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) return;

    navigator
      .requestMIDIAccess()
      .then((access) => {
        const attach = () => {
          const output = Array.from(access.outputs.values())[0];
          outputRef.current = output ?? null;
          setDeviceName(output?.name ?? null);
        };
        attach();
        access.onstatechange = attach;
      })
      .catch(() => {
        outputRef.current = null;
        setDeviceName(null);
      });

    return () => {
      outputRef.current = null;
    };
  }, []);

  const send = (bytes: number[]) => {
    outputRef.current?.send(bytes);
  };

  return { deviceName, send };
}
