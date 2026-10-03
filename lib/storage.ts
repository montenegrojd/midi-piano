import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, uniqueSlug, readJsonFile, writeJsonFile, getTakesFor, appendTakeFor, deleteTakeFor, deleteEntityDir } from "./entityStorage";
import { parseMidiFileWithGrid, summarizeParsedMidi, type ParsedMidiFile } from "./midiParser";
import type { Piece, PieceSummary, Take } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const MIDI_LIBRARY_DIR = path.join(DATA_DIR, "midi-library");
const PIECES_DIR = path.join(DATA_DIR, "pieces");
const MANIFEST = "piece.json";

export async function listMidiLibrary(): Promise<string[]> {
  await ensureDir(MIDI_LIBRARY_DIR);
  const files = await fs.readdir(MIDI_LIBRARY_DIR);
  return files.filter((f) => /\.(mid|midi)$/i.test(f)).sort();
}

export class MidiFileNotFoundError extends Error {}

async function parseLibraryFile(filename: string): Promise<ParsedMidiFile> {
  const bytes = await fs.readFile(path.join(MIDI_LIBRARY_DIR, filename));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return parseMidiFileWithGrid(arrayBuffer); // throws if the file isn't a valid SMF
}

export async function getReferenceMidi(filename: string): Promise<ParsedMidiFile> {
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
  const summary = summarizeParsedMidi(parsed.channels);

  const slug = await uniqueSlug(PIECES_DIR, trimmedName, MANIFEST);
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
  await writeJsonFile(path.join(pieceDir, MANIFEST), piece);
  await writeJsonFile(path.join(pieceDir, "takes.json"), []);

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
  return readJsonFile<Piece>(path.join(PIECES_DIR, slug, MANIFEST));
}

export async function getTakes(slug: string): Promise<Take[]> {
  return getTakesFor(PIECES_DIR, slug);
}

export async function appendTake(slug: string, take: Omit<Take, "id" | "recordedAt">): Promise<Take> {
  const piece = await getPiece(slug);
  if (!piece) throw new Error(`Piece "${slug}" does not exist.`);
  return appendTakeFor(PIECES_DIR, slug, take);
}

export async function deleteTake(slug: string, takeId: string): Promise<boolean> {
  return deleteTakeFor(PIECES_DIR, slug, takeId);
}

export async function deletePiece(slug: string): Promise<boolean> {
  return deleteEntityDir(PIECES_DIR, slug, MANIFEST);
}
