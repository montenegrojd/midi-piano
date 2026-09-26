import { formatTimer } from "@/lib/format";
import styles from "./PlaybackProgress.module.css";

interface PlaybackProgressProps {
  elapsedMs: number;
  totalMs: number;
}

export default function PlaybackProgress({ elapsedMs, totalMs }: PlaybackProgressProps) {
  const pct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
  return (
    <div className={styles.wrap}>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.time}>
        {formatTimer(elapsedMs)} / {formatTimer(totalMs)}
      </span>
    </div>
  );
}
