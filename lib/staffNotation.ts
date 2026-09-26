/**
 * Maps MIDI note numbers to a position on a grand staff (treble + bass, joined at middle C).
 *
 * Staff position is driven by "diatonic step" — a running count of natural letters (C,D,E,F,G,A,B)
 * from an arbitrary origin, independent of sharps/flats. Adjacent letters always sit half a
 * line-spacing apart (line -> next space -> next line...), so a single linear function of the
 * step number gives every notehead's y position, and lines/ledger-lines fall out of the same
 * arithmetic: every staff line (treble and bass) and the middle-C ledger line are exactly two
 * diatonic steps apart, i.e. one contiguous sequence — G2, B2, D3, F3, A3, [C4], E4, G4, B4, D5, F5.
 */

const LETTER_INDEX_BY_PITCH_CLASS: Array<readonly [letter: number, sharp: boolean]> = [
  [0, false], // C
  [0, true], // C#
  [1, false], // D
  [1, true], // D#
  [2, false], // E
  [3, false], // F
  [3, true], // F#
  [4, false], // G
  [4, true], // G#
  [5, false], // A
  [5, true], // A#
  [6, false], // B
];

function diatonicStep(midi: number): { step: number; sharp: boolean } {
  const pitchClass = ((midi % 12) + 12) % 12;
  const [letter, sharp] = LETTER_INDEX_BY_PITCH_CLASS[pitchClass];
  const octave = Math.floor(midi / 12) - 1;
  return { step: octave * 7 + letter, sharp };
}

export const MIDDLE_C_STEP = diatonicStep(60).step; // 28

export const TREBLE_LINE_STEPS = [30, 32, 34, 36, 38]; // E4 G4 B4 D5 F5
export const BASS_LINE_STEPS = [18, 20, 22, 24, 26]; // G2 B2 D3 F3 A3

const TREBLE_TOP_STEP = TREBLE_LINE_STEPS[TREBLE_LINE_STEPS.length - 1];
const BASS_BOTTOM_STEP = BASS_LINE_STEPS[0];

export function lineStepY(step: number, halfSpacing: number, middleCY: number): number {
  return middleCY - (step - MIDDLE_C_STEP) * halfSpacing;
}

export interface NoteStaffPosition {
  y: number;
  sharp: boolean;
  /** "line" steps a ledger line must be drawn at (above the treble staff, below the bass staff, or the single middle-C ledger). */
  ledgerSteps: number[];
}

export function staffPosition(midi: number, halfSpacing: number, middleCY: number): NoteStaffPosition {
  const { step, sharp } = diatonicStep(midi);
  const y = lineStepY(step, halfSpacing, middleCY);
  const isLine = step % 2 === 0;

  const ledgerSteps: number[] = [];
  if (step > TREBLE_TOP_STEP) {
    const to = isLine ? step : step - 1;
    for (let s = TREBLE_TOP_STEP + 2; s <= to; s += 2) ledgerSteps.push(s);
  } else if (step < BASS_BOTTOM_STEP) {
    const to = isLine ? step : step + 1;
    for (let s = BASS_BOTTOM_STEP - 2; s >= to; s -= 2) ledgerSteps.push(s);
  } else if (step === MIDDLE_C_STEP) {
    ledgerSteps.push(MIDDLE_C_STEP);
  }

  return { y, sharp, ledgerSteps };
}
