import { NextResponse } from "next/server";
import { createDrill, validateDrillPattern } from "@/lib/drillStorage";

export async function POST(request: Request) {
  let body: { name?: unknown; pattern?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) return NextResponse.json({ error: "Drill name is required." }, { status: 400 });

  const pattern = validateDrillPattern(body.pattern);
  if (!pattern) return NextResponse.json({ error: "Pattern is missing or malformed." }, { status: 400 });

  try {
    const drill = await createDrill(name, pattern);
    return NextResponse.json({ slug: drill.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create drill.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
