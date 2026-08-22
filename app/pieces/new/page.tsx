import { listMidiLibrary } from "@/lib/storage";
import NewPieceForm from "./NewPieceForm";

export const dynamic = "force-dynamic"; // always read the current midi-library/ directory, never statically cache

export default async function NewPiecePage() {
  const library = await listMidiLibrary();
  return <NewPieceForm library={library} />;
}
