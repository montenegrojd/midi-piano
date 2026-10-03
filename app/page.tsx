import { listPieceSummaries } from "@/lib/storage";
import { listDrillSummaries } from "@/lib/drillStorage";
import styles from "./page.module.css";

export const dynamic = "force-dynamic"; // always read the current pieces/drills directories, never statically cache

export default async function HomePage() {
  const [pieces, drills] = await Promise.all([listPieceSummaries(), listDrillSummaries()]);

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

      <div className={styles.header} style={{ marginTop: 36 }}>
        <h1 className={styles.title}>Rhythm Drills</h1>
        <a className={styles.newLink} href="/drills/new">
          + New drill
        </a>
      </div>

      {drills.length === 0 ? (
        <div className={styles.emptyNote}>No drills yet — create one to practice tapping a generated rhythm pattern against a click track.</div>
      ) : (
        <div className={styles.grid}>
          {drills.map((d) => (
            <a key={d.id} href={`/drills/${d.id}`} className={styles.card}>
              <div className={styles.cardName}>{d.name}</div>
              <div className={styles.cardMeta}>
                {d.takeCount} take{d.takeCount === 1 ? "" : "s"}
                <br />
                {d.bpm} BPM · {d.bars} bars · {d.subdivision}
                <br />
                {new Date(d.createdAt).toLocaleDateString()}
              </div>
            </a>
          ))}
        </div>
      )}

      <div style={{ marginTop: 40, fontSize: 11 }}>
        <a href="/midi-diagnostics" style={{ color: "#6a6455" }}>
          MIDI diagnostics
        </a>
      </div>
    </div>
  );
}
