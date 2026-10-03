"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./DeletePieceButton.module.css";

interface DeleteDrillButtonProps {
  drillId: string;
  takeCount: number;
}

export default function DeleteDrillButton({ drillId, takeCount }: DeleteDrillButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/drills/${drillId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete drill.");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete drill.");
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button className={styles.deleteBtn} onClick={() => setConfirming(true)}>
        delete drill
      </button>
    );
  }

  return (
    <div className={styles.confirm}>
      <span>
        Delete this drill{takeCount > 0 ? ` and its ${takeCount} take${takeCount === 1 ? "" : "s"}` : ""}? This can&apos;t be undone.
      </span>
      <span className={styles.actions}>
        <button className={styles.yes} onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button className={styles.no} onClick={() => setConfirming(false)} disabled={deleting}>
          Cancel
        </button>
      </span>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
