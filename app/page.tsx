import { listPieceSummaries } from "@/lib/storage";
import styles from "./page.module.css";

export const dynamic = "force-dynamic"; // always read the current pieces/ directory, never statically cache

export default async function HomePage() {
  const pieces = await listPieceSummaries();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Piano Practice</h1>
        <a className={styles.newLink} href="/pieces/new">
          + New piece
        </a>
      </div>

      {pieces.length === 0 ? (
        <div className={styles.emptyNote}>No pieces yet — create one to attach a reference MIDI file and start recording takes.</div>
      ) : (
        <div className={styles.grid}>
          {pieces.map((p) => (
            <a key={p.id} href={`/pieces/${p.id}`} className={styles.card}>
              <div className={styles.cardName}>{p.name}</div>
              <div className={styles.cardMeta}>
                {p.takeCount} take{p.takeCount === 1 ? "" : "s"}
                <br />
                {p.referenceMidiFilename}
                <br />
                {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
