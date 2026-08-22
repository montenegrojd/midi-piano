import { NextResponse } from "next/server";
import { createPiece, MidiFileNotFoundError } from "@/lib/storage";

export async function POST(request: Request) {
  let body: { name?: unknown; referenceMidiFilename?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const referenceMidiFilename = typeof body.referenceMidiFilename === "string" ? body.referenceMidiFilename : "";

  if (!name.trim()) return NextResponse.json({ error: "Piece name is required." }, { status: 400 });
  if (!referenceMidiFilename) return NextResponse.json({ error: "A reference MIDI file must be selected." }, { status: 400 });

  try {
    const piece = await createPiece(name, referenceMidiFilename);
    return NextResponse.json({ slug: piece.id }, { status: 201 });
  } catch (err) {
    if (err instanceof MidiFileNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to create piece.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
