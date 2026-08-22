import { NextResponse } from "next/server";
import { appendTake, getPiece } from "@/lib/storage";
import type { NoteEvent, TakeStats } from "@/lib/types";

function isValidEvents(value: unknown): value is NoteEvent[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (e) =>
        e &&
        typeof e.note === "number" &&
        typeof e.onTime === "number" &&
        typeof e.offTime === "number" &&
        typeof e.velocity === "number"
    )
  );
}

function isValidStats(value: unknown): value is TakeStats {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.noteCount === "number" &&
    typeof s.totalDuration === "string" &&
    typeof s.avgIOI === "number" &&
    typeof s.consistencyPct === "number" &&
    typeof s.avgVelocity === "number" &&
    typeof s.avgDuration === "number" &&
    typeof s.approxBPM === "number"
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const piece = await getPiece(slug);
  if (!piece) return NextResponse.json({ error: `Piece "${slug}" does not exist.` }, { status: 404 });

  let body: { events?: unknown; stats?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidEvents(body.events)) return NextResponse.json({ error: "events must be a non-empty array of note events." }, { status: 400 });
  if (!isValidStats(body.stats)) return NextResponse.json({ error: "stats is missing or malformed." }, { status: 400 });

  const take = await appendTake(slug, { events: body.events, stats: body.stats });
  return NextResponse.json(take, { status: 201 });
}
