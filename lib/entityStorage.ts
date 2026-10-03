import { promises as fs } from "node:fs";
import path from "node:path";
import type { Take } from "./types";

/**
 * Slug/take-CRUD plumbing shared by Pieces and Drills — the only difference between the two is
 * their base directory and their own manifest file (piece.json vs drill.json). Everything here is
 * agnostic to what a "manifest" actually contains.
 */

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

export async function manifestExists(baseDir: string, slug: string, manifestFile: string): Promise<boolean> {
  try {
    await fs.access(path.join(baseDir, slug, manifestFile));
    return true;
  } catch {
    return false;
  }
}

export async function uniqueSlug(baseDir: string, name: string, manifestFile: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (await manifestExists(baseDir, candidate, manifestFile)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(file: string, data: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function getTakesFor(baseDir: string, slug: string): Promise<Take[]> {
  return (await readJsonFile<Take[]>(path.join(baseDir, slug, "takes.json"))) ?? [];
}

export async function appendTakeFor(baseDir: string, slug: string, take: Omit<Take, "id" | "recordedAt">): Promise<Take> {
  const fullTake: Take = { ...take, id: `${Date.now()}`, recordedAt: Date.now() };
  const takes = await getTakesFor(baseDir, slug);
  takes.push(fullTake);
  await writeJsonFile(path.join(baseDir, slug, "takes.json"), takes);
  return fullTake;
}

export async function deleteTakeFor(baseDir: string, slug: string, takeId: string): Promise<boolean> {
  const takes = await getTakesFor(baseDir, slug);
  const next = takes.filter((t) => t.id !== takeId);
  if (next.length === takes.length) return false;
  await writeJsonFile(path.join(baseDir, slug, "takes.json"), next);
  return true;
}

export async function deleteEntityDir(baseDir: string, slug: string, manifestFile: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(slug) || !(await manifestExists(baseDir, slug, manifestFile))) return false;
  await fs.rm(path.join(baseDir, slug), { recursive: true });
  return true;
}
