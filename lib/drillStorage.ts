import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, uniqueSlug, readJsonFile, writeJsonFile, getTakesFor, appendTakeFor, deleteTakeFor, deleteEntityDir } from "./entityStorage";
import type { Drill, DrillPattern, DrillSummary, Take } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DRILLS_DIR = path.join(DATA_DIR, "drills");
const MANIFEST = "drill.json";

const VALID_SUBDIVISIONS = new Set(["quarter", "eighth", "triplet", "sixteenth"]);

export function validateDrillPattern(value: unknown): DrillPattern | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const ts = p.timeSignature as Record<string, unknown> | undefined;
  if (!ts || typeof ts.numerator !== "number" || typeof ts.denominator !== "number") return null;
  if (ts.numerator < 1 || ts.numerator > 32 || ![1, 2, 4, 8, 16].includes(ts.denominator)) return null;
  if (typeof p.bpm !== "number" || p.bpm < 20 || p.bpm > 300) return null;
  if (typeof p.bars !== "number" || p.bars < 1 || p.bars > 200) return null;
  if (typeof p.subdivision !== "string" || !VALID_SUBDIVISIONS.has(p.subdivision)) return null;
  return {
    timeSignature: { numerator: ts.numerator, denominator: ts.denominator },
    bpm: p.bpm,
    bars: p.bars,
    subdivision: p.subdivision as DrillPattern["subdivision"],
  };
}

export async function createDrill(name: string, pattern: DrillPattern): Promise<Drill> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Drill name is required.");

  const slug = await uniqueSlug(DRILLS_DIR, trimmedName, MANIFEST);
  const drill: Drill = { id: slug, name: trimmedName, createdAt: Date.now(), pattern };

  const drillDir = path.join(DRILLS_DIR, slug);
  await ensureDir(drillDir);
  await writeJsonFile(path.join(drillDir, MANIFEST), drill);
  await writeJsonFile(path.join(drillDir, "takes.json"), []);

  return drill;
}

export async function listDrillSummaries(): Promise<DrillSummary[]> {
  await ensureDir(DRILLS_DIR);
  const slugs = await fs.readdir(DRILLS_DIR);
  const summaries: DrillSummary[] = [];
  for (const slug of slugs) {
    const drill = await getDrill(slug);
    if (!drill) continue;
    const takes = await getDrillTakes(slug);
    summaries.push({
      id: drill.id,
      name: drill.name,
      createdAt: drill.createdAt,
      bpm: drill.pattern.bpm,
      bars: drill.pattern.bars,
      subdivision: drill.pattern.subdivision,
      takeCount: takes.length,
    });
  }
  summaries.sort((a, b) => b.createdAt - a.createdAt);
  return summaries;
}

export async function getDrill(slug: string): Promise<Drill | null> {
  return readJsonFile<Drill>(path.join(DRILLS_DIR, slug, MANIFEST));
}

export async function getDrillTakes(slug: string): Promise<Take[]> {
  return getTakesFor(DRILLS_DIR, slug);
}

export async function appendDrillTake(slug: string, take: Omit<Take, "id" | "recordedAt">): Promise<Take> {
  const drill = await getDrill(slug);
  if (!drill) throw new Error(`Drill "${slug}" does not exist.`);
  return appendTakeFor(DRILLS_DIR, slug, take);
}

export async function deleteDrillTake(slug: string, takeId: string): Promise<boolean> {
  return deleteTakeFor(DRILLS_DIR, slug, takeId);
}

export async function deleteDrill(slug: string): Promise<boolean> {
  return deleteEntityDir(DRILLS_DIR, slug, MANIFEST);
}
