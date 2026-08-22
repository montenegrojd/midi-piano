import { promises as fs } from "node:fs";
import path from "node:path";
import { parseMidiFile, summarizeParsedMidi, type ParsedMidi } from "./midiParser";
import type { Piece, PieceSummary, Take } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const MIDI_LIBRARY_DIR = path.join(DATA_DIR, "midi-library");
const PIECES_DIR = path.join(DATA_DIR, "pieces");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function listMidiLibrary(): Promise<string[]> {
  await ensureDir(MIDI_LIBRARY_DIR);
  const files = await fs.readdir(MIDI_LIBRARY_DIR);
  return files.filter((f) => /\.(mid|midi)$/i.test(f)).sort();
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "piece";
}

async function pieceDirExists(slug: string): Promise<boolean> {
  try {
    await fs.access(path.join(PIECES_DIR, slug, "piece.json"));
    return true;
  } catch {
    return false;
  }
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (await pieceDirExists(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

export class MidiFileNotFoundError extends Error {}

async function parseLibraryFile(filename: string): Promise<ParsedMidi> {
  const bytes = await fs.readFile(path.join(MIDI_LIBRARY_DIR, filename));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return parseMidiFile(arrayBuffer); // throws if the file isn't a valid SMF
}

export async function getReferenceMidi(filename: string): Promise<ParsedMidi> {
  return parseLibraryFile(filename);
}

export async function createPiece(name: string, referenceMidiFilename: string): Promise<Piece> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Piece name is required.");

  const library = await listMidiLibrary();
  if (!library.includes(referenceMidiFilename)) {
    throw new MidiFileNotFoundError(`"${referenceMidiFilename}" was not found in the MIDI library.`);
  }

  const parsed = await parseLibraryFile(referenceMidiFilename);
  const summary = summarizeParsedMidi(parsed);

  const slug = await uniqueSlug(trimmedName);
  const piece: Piece = {
    id: slug,
    name: trimmedName,
    createdAt: Date.now(),
    referenceMidiFilename,
    referenceInfo: {
      noteCount: summary.noteCount,
      durationMs: summary.durationMs,
      channels: summary.channels,
    },
  };

  const pieceDir = path.join(PIECES_DIR, slug);
  await ensureDir(pieceDir);
  await fs.writeFile(path.join(pieceDir, "piece.json"), JSON.stringify(piece, null, 2));
  await fs.writeFile(path.join(pieceDir, "takes.json"), JSON.stringify([], null, 2));

  return piece;
}

export async function listPieceSummaries(): Promise<PieceSummary[]> {
  await ensureDir(PIECES_DIR);
  const slugs = await fs.readdir(PIECES_DIR);
  const summaries: PieceSummary[] = [];
  for (const slug of slugs) {
    const piece = await getPiece(slug);
    if (!piece) continue;
    const takes = await getTakes(slug);
    summaries.push({
      id: piece.id,
      name: piece.name,
      createdAt: piece.createdAt,
      referenceMidiFilename: piece.referenceMidiFilename,
      takeCount: takes.length,
    });
  }
  summaries.sort((a, b) => b.createdAt - a.createdAt);
  return summaries;
}

export async function getPiece(slug: string): Promise<Piece | null> {
  try {
    const raw = await fs.readFile(path.join(PIECES_DIR, slug, "piece.json"), "utf-8");
    return JSON.parse(raw) as Piece;
  } catch {
    return null;
  }
}

export async function getTakes(slug: string): Promise<Take[]> {
  try {
    const raw = await fs.readFile(path.join(PIECES_DIR, slug, "takes.json"), "utf-8");
    return JSON.parse(raw) as Take[];
  } catch {
    return [];
  }
}

export async function appendTake(slug: string, take: Omit<Take, "id" | "recordedAt">): Promise<Take> {
  const piece = await getPiece(slug);
  if (!piece) throw new Error(`Piece "${slug}" does not exist.`);

  const fullTake: Take = {
    ...take,
    id: `${Date.now()}`,
    recordedAt: Date.now(),
  };
  const takes = await getTakes(slug);
  takes.push(fullTake);
  await fs.writeFile(path.join(PIECES_DIR, slug, "takes.json"), JSON.stringify(takes, null, 2));
  return fullTake;
}

export async function deleteTake(slug: string, takeId: string): Promise<boolean> {
  const takes = await getTakes(slug);
  const next = takes.filter((t) => t.id !== takeId);
  if (next.length === takes.length) return false; // nothing matched that id
  await fs.writeFile(path.join(PIECES_DIR, slug, "takes.json"), JSON.stringify(next, null, 2));
  return true;
}
