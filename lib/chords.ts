export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function midiToName(n: number): string {
  const octave = Math.floor(n / 12) - 1;
  return NOTE_NAMES[n % 12] + octave;
}

/**
 * Interval sets are checked against every pitch class as a candidate root — this also handles
 * inversions for free, since a chord's pitch-class set is the same regardless of which note is
 * in the bass (C+E+G, E+G+C, and G+C+E all reduce to the same {0,4,7}). Ported from the POC.
 */
const CHORD_TEMPLATES = [
  { suffix: "", intervals: [0, 4, 7] }, // major
  { suffix: "m", intervals: [0, 3, 7] }, // minor
  { suffix: "dim", intervals: [0, 3, 6] },
  { suffix: "aug", intervals: [0, 4, 8] },
  { suffix: "sus2", intervals: [0, 2, 7] },
  { suffix: "sus4", intervals: [0, 5, 7] },
  { suffix: "maj7", intervals: [0, 4, 7, 11] },
  { suffix: "7", intervals: [0, 4, 7, 10] },
  { suffix: "m7", intervals: [0, 3, 7, 10] },
  { suffix: "m7b5", intervals: [0, 3, 6, 10] },
  { suffix: "dim7", intervals: [0, 3, 6, 9] },
];

const INTERVAL_NAMES: Record<number, string> = {
  1: "minor 2nd",
  2: "major 2nd",
  3: "minor 3rd",
  4: "major 3rd",
  5: "perfect 4th",
  6: "tritone",
  7: "perfect 5th",
  8: "minor 6th",
  9: "major 6th",
  10: "minor 7th",
  11: "major 7th",
};

export function detectChord(noteNumbers: number[]): string {
  const pitchClasses = [...new Set(noteNumbers.map((n) => n % 12))].sort((a, b) => a - b);
  if (pitchClasses.length < 2) return "";
  if (pitchClasses.length === 2) {
    const diff = (pitchClasses[1] - pitchClasses[0] + 12) % 12;
    return `${NOTE_NAMES[pitchClasses[0]]}–${NOTE_NAMES[pitchClasses[1]]} (${INTERVAL_NAMES[diff] || diff})`;
  }
  // Try the lowest played note as the root first, so ambiguous spellings (Csus2 vs Gsus4) follow the bass note.
  const bassPitchClass = Math.min(...noteNumbers) % 12;
  const rootsToTry = [bassPitchClass, ...pitchClasses.filter((pc) => pc !== bassPitchClass)];
  for (const root of rootsToTry) {
    const fromRoot = pitchClasses.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
    const template = CHORD_TEMPLATES.find((t) => t.intervals.length === fromRoot.length && t.intervals.every((iv, i) => iv === fromRoot[i]));
    if (template) return NOTE_NAMES[root] + template.suffix;
  }
  return pitchClasses.map((pc) => NOTE_NAMES[pc]).join("+");
}
