"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./NewPieceForm.module.css";

export default function NewPieceForm({ library }: { library: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [filename, setFilename] = useState(library[0] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !filename) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, referenceMidiFilename: filename }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create piece.");
      router.push(`/pieces/${body.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create piece.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <a href="/" className={styles.backLink}>
        ← All pieces
      </a>
      <h1 className={styles.title}>New piece</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gavotte" autoFocus required />
        </label>
        <label className={styles.field}>
          <span>Reference MIDI file</span>
          {library.length === 0 ? (
            <p className={styles.warning}>No .mid files found in data/midi-library/.</p>
          ) : (
            <select value={filename} onChange={(e) => setFilename(e.target.value)} required>
              {library.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submit} disabled={submitting || library.length === 0}>
          {submitting ? "Creating…" : "Create piece"}
        </button>
      </form>
    </div>
  );
}
