import { NextResponse } from "next/server";
import { deletePiece } from "@/lib/storage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const removed = await deletePiece(slug);
  if (!removed) return NextResponse.json({ error: `Piece "${slug}" does not exist.` }, { status: 404 });
  return NextResponse.json({ ok: true });
}
