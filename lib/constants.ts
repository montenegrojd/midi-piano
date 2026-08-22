export const RECORD_TOGGLE_NOTE = 21; // A0, the lowest key — hands-free start/stop recording toggle
export const PLAYBACK_CHANNEL = 0; // MIDI channel 1 — the default receive channel on most digital pianos

// Shared by CombinedTimeline and VelocityChart so their x-axes line up when stacked.
export const TIMELINE_WIDTH = 1200; // bars area, excluding the label gutter
export const TIMELINE_LABEL_GUTTER = 34; // viewBox units reserved on the left for row labels
export const TIMELINE_REFERENCE_FILL = "rgba(140,170,255,0.55)"; // blue
export const TIMELINE_TAKE_FILL = "rgba(255,182,72,0.6)"; // amber
export const TIMING_DEVIATION_FILL = "rgba(168,140,255,0.75)"; // violet — distinct from ref/take/issue colors
