import { notFound } from "next/navigation";
import { getDrill, getDrillTakes } from "@/lib/drillStorage";
import { generateDrillBeatGrid } from "@/lib/drillPattern";
import DrillWorkspace from "@/components/DrillWorkspace";

export default async function DrillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const drill = await getDrill(slug);
  if (!drill) notFound();

  const takes = await getDrillTakes(slug);
  const beats = generateDrillBeatGrid(drill.pattern);
  return <DrillWorkspace drill={drill} takes={takes} beats={beats} />;
}
