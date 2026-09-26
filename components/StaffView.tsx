import { staffPosition, lineStepY, TREBLE_LINE_STEPS, BASS_LINE_STEPS } from "@/lib/staffNotation";
import styles from "./StaffView.module.css";

interface StaffViewProps {
  activeNotes: number[];
}

const HALF_SPACING = 14.4; // px, per diatonic step — line-to-line spacing is 2x this
const MIDDLE_C_Y = 461;
const X_GUTTER = 133; // room for the clef glyphs
const STAFF_WIDTH = 317;
const VIEW_W = X_GUTTER + STAFF_WIDTH + 52;
const VIEW_H = 850; // fixed to fit the full 88-key range (A0-C8) so the staff never rescales while playing
const NOTE_RX = 16;
const NOTE_RY = 11.5;
const CENTER_X = X_GUTTER + STAFF_WIDTH / 2;

const STAFF_LINE_STROKE = "var(--ivory-dim)";

/**
 * A live grand-staff readout of whatever note(s) are currently sounding — a glance-friendly
 * companion to the text note tags, not engraved sheet music (no rhythm/duration is shown).
 * Position math lives in lib/staffNotation.ts; this component is just the SVG rendering.
 */
export default function StaffView({ activeNotes }: StaffViewProps) {
  const notes = [...new Set(activeNotes)].sort((a, b) => a - b);
  const positions = notes.map((note) => ({ note, ...staffPosition(note, HALF_SPACING, MIDDLE_C_Y) }));

  // Offset a note horizontally when it's a "second" away from its neighbor (adjacent line/space) so the two noteheads don't fully overlap.
  const xs = positions.map((p, i) => {
    const prev = i > 0 ? positions[i - 1] : null;
    const isSecond = prev !== null && Math.abs(p.y - prev.y) <= HALF_SPACING + 0.5;
    return isSecond ? CENTER_X + NOTE_RX * 1.15 : CENTER_X;
  });

  return (
    <div className={styles.wrap}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height={VIEW_H} style={{ display: "block" }}>
        {TREBLE_LINE_STEPS.map((s) => (
          <line
            key={`t${s}`}
            x1={X_GUTTER}
            y1={lineStepY(s, HALF_SPACING, MIDDLE_C_Y)}
            x2={X_GUTTER + STAFF_WIDTH}
            y2={lineStepY(s, HALF_SPACING, MIDDLE_C_Y)}
            stroke={STAFF_LINE_STROKE}
            strokeWidth={1}
          />
        ))}
        {BASS_LINE_STEPS.map((s) => (
          <line
            key={`b${s}`}
            x1={X_GUTTER}
            y1={lineStepY(s, HALF_SPACING, MIDDLE_C_Y)}
            x2={X_GUTTER + STAFF_WIDTH}
            y2={lineStepY(s, HALF_SPACING, MIDDLE_C_Y)}
            stroke={STAFF_LINE_STROKE}
            strokeWidth={1}
          />
        ))}

        {/* G clef's inner loop centers on G4 (2nd line from bottom); the +22 corrects for the font's baseline metrics. */}
        <text x={X_GUTTER - 18} y={lineStepY(32, HALF_SPACING, MIDDLE_C_Y) + 22} textAnchor="end" fontSize={115} fill={STAFF_LINE_STROKE}>
          𝄞
        </text>
        {/* F clef's two dots straddle F3 (2nd line from top); the +32 corrects for the font's baseline metrics. */}
        <text x={X_GUTTER - 18} y={lineStepY(24, HALF_SPACING, MIDDLE_C_Y) + 32} textAnchor="end" fontSize={68} fill={STAFF_LINE_STROKE}>
          𝄢
        </text>

        {positions.map((p, i) => (
          <g key={p.note}>
            {p.ledgerSteps.map((s) => (
              <line
                key={s}
                x1={xs[i] - NOTE_RX - 11}
                y1={lineStepY(s, HALF_SPACING, MIDDLE_C_Y)}
                x2={xs[i] + NOTE_RX + 11}
                y2={lineStepY(s, HALF_SPACING, MIDDLE_C_Y)}
                stroke={STAFF_LINE_STROKE}
                strokeWidth={1}
              />
            ))}
            {p.sharp && (
              <text x={xs[i] - NOTE_RX - 25} y={p.y + 13} fontSize={38} fill="var(--brass-glow)">
                ♯
              </text>
            )}
            <ellipse cx={xs[i]} cy={p.y} rx={NOTE_RX} ry={NOTE_RY} fill="var(--brass-glow)" transform={`rotate(-18 ${xs[i]} ${p.y})`} />
          </g>
        ))}
      </svg>
    </div>
  );
}
