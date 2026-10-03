const CC_NAMES: Record<number, string> = {
  0: "Bank select (MSB)", 1: "Modulation", 7: "Volume", 10: "Pan", 11: "Expression", 32: "Bank select (LSB)",
  64: "Sustain pedal", 65: "Portamento", 66: "Sostenuto pedal", 67: "Soft pedal", 91: "Reverb depth", 93: "Chorus depth",
  120: "All sound off", 121: "Reset controllers", 122: "Local control", 123: "All notes off",
};

const MANUFACTURERS: Record<number, string> = {
  0x40: "Kawai", 0x41: "Roland", 0x42: "Korg", 0x43: "Yamaha", 0x44: "Casio", 0x07: "Kurzweil", 0x47: "Akai",
};

export const hex = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();

export interface DecodedMessage {
  kind: "note" | "cc" | "program" | "pitchbend" | "pressure" | "sysex" | "realtime" | "other";
  text: string;
}

/** Identity Reply: F0 7E <dev> 06 02 <mfr 1 or 3 bytes> <family 2> <member 2> <version 4> F7 */
export function parseIdentityReply(data: ArrayLike<number>): string | null {
  if (data.length < 15 || data[0] !== 0xf0 || data[1] !== 0x7e || data[3] !== 0x06 || data[4] !== 0x02) return null;
  const extended = data[5] === 0x00;
  const mfrLen = extended ? 3 : 1;
  const mfr = extended ? `ID ${hex([data[5], data[6], data[7]])}` : (MANUFACTURERS[data[5]] ?? `ID ${hex([data[5]])}`);
  const i = 5 + mfrLen;
  const family = hex([data[i], data[i + 1]]);
  const member = hex([data[i + 2], data[i + 3]]);
  const version = hex([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]);
  return `Identity reply — manufacturer: ${mfr}, family: ${family}, model: ${member}, version: ${version}`;
}

export function decodeMidiMessage(data: ArrayLike<number>): DecodedMessage {
  const status = data[0];
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;

  if (status === 0xf0) {
    return { kind: "sysex", text: parseIdentityReply(data) ?? `SysEx (${data.length} bytes): ${hex(data)}` };
  }
  if (status >= 0xf8) {
    const names: Record<number, string> = { 0xf8: "Timing clock", 0xfa: "Start", 0xfb: "Continue", 0xfc: "Stop", 0xfe: "Active sensing", 0xff: "System reset" };
    return { kind: "realtime", text: names[status] ?? `System message ${hex([status])}` };
  }
  if (status >= 0xf0) return { kind: "other", text: `System common ${hex(data)}` };

  const ch = (status & 0x0f) + 1;
  switch (status & 0xf0) {
    case 0x90:
      return d2 === 0 ? { kind: "note", text: `Note off  ch${ch}  note ${d1}` } : { kind: "note", text: `Note on   ch${ch}  note ${d1}  velocity ${d2}` };
    case 0x80:
      return { kind: "note", text: `Note off  ch${ch}  note ${d1}  velocity ${d2}` };
    case 0xa0:
      return { kind: "pressure", text: `Poly aftertouch  ch${ch}  note ${d1}  pressure ${d2}` };
    case 0xb0:
      return { kind: "cc", text: `Control change  ch${ch}  CC ${d1}${CC_NAMES[d1] ? ` (${CC_NAMES[d1]})` : ""}  value ${d2}` };
    case 0xc0:
      return { kind: "program", text: `Program change  ch${ch}  program ${d1}` };
    case 0xd0:
      return { kind: "pressure", text: `Channel pressure  ch${ch}  pressure ${d1}` };
    case 0xe0:
      return { kind: "pitchbend", text: `Pitch bend  ch${ch}  value ${((d2 << 7) | d1) - 8192}` };
    default:
      return { kind: "other", text: hex(data) };
  }
}
