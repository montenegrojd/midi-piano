import { TIMELINE_LABEL_GUTTER as LABEL_GUTTER } from "@/lib/constants";
import type { GridBeat } from "@/lib/midiParser";
import type { NormalizedEvents } from "@/lib/timelineUtils";

interface BarGridProps {
  beats: GridBeat[] | undefined;
  reference: NormalizedEvents; // the reference's normalization, so lines land on the same x axis as its notes
  height: number;
  plotWidth: number; // width of the plot area (chart width minus the label gutter)
  showLabels?: boolean;
}

/**
 * Bar lines (full height, numbered) and beat ticks (bottom edge) for the reference's time
 * signature. Bars are numbered from the first downbeat the selected notes reach, and labels thin
 * out on long pieces. Returns null when there's no grid, so charts can render it unconditionally.
 */
export default function BarGrid({ beats, reference, height, plotWidth: W, showLabels = true }: BarGridProps) {
  if (!beats || beats.length === 0) return null;

  const inRange = beats.filter((b) => b.ms >= reference.t0 - 0.5 && b.ms <= reference.t0 + reference.total + 0.5);
  if (inRange.length === 0) return null;
  const firstBar = inRange.find((b) => b.beatInBar === 1)?.bar ?? 1;
  const barCount = inRange.filter((b) => b.beatInBar === 1).length;
  const labelEvery = barCount > 60 ? 4 : barCount > 30 ? 2 : 1;

  return (
    <g>
      {inRange.map((b, i) => {
        const x = LABEL_GUTTER + ((b.ms - reference.t0) / reference.total) * W;
        if (b.beatInBar !== 1) {
          return <line key={i} x1={x} y1={height - 7} x2={x} y2={height} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />;
        }
        const n = b.bar - firstBar + 1;
        return (
          <g key={i}>
            <line x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
            {showLabels && (n === 1 || n % labelEvery === 0) && (
              <text x={x + 3} y={9} fontSize={9} fill="#8a7f66">
                {n}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
