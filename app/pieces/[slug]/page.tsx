import { notFound } from "next/navigation";
import { getPiece, getTakes, getReferenceMidi } from "@/lib/storage";
import PieceWorkspace from "@/components/PieceWorkspace";

export default async function PiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const piece = await getPiece(slug);
  if (!piece) notFound();

  const [takes, referenceChannels] = await Promise.all([getTakes(slug), getReferenceMidi(piece.referenceMidiFilename)]);
  return <PieceWorkspace piece={piece} takes={takes} referenceChannels={referenceChannels} />;
}
