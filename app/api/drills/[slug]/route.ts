import { NextResponse } from "next/server";
import { deleteDrill } from "@/lib/drillStorage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const removed = await deleteDrill(slug);
  if (!removed) return NextResponse.json({ error: `Drill "${slug}" does not exist.` }, { status: 404 });
  return NextResponse.json({ ok: true });
}
