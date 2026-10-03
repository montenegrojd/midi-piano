import { NextResponse } from "next/server";
import { deleteDrillTake, getDrill } from "@/lib/drillStorage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; takeId: string }> }) {
  const { slug, takeId } = await params;
  const drill = await getDrill(slug);
  if (!drill) return NextResponse.json({ error: `Drill "${slug}" does not exist.` }, { status: 404 });

  const removed = await deleteDrillTake(slug, takeId);
  if (!removed) return NextResponse.json({ error: `Take "${takeId}" does not exist.` }, { status: 404 });

  return NextResponse.json({ ok: true });
}
