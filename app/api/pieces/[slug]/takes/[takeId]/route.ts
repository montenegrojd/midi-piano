import { NextResponse } from "next/server";
import { deleteTake, getPiece } from "@/lib/storage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; takeId: string }> }) {
  const { slug, takeId } = await params;
  const piece = await getPiece(slug);
  if (!piece) return NextResponse.json({ error: `Piece "${slug}" does not exist.` }, { status: 404 });

  const removed = await deleteTake(slug, takeId);
  if (!removed) return NextResponse.json({ error: `Take "${takeId}" does not exist.` }, { status: 404 });

  return NextResponse.json({ ok: true });
}
