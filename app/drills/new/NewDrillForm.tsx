"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DrillSubdivision } from "@/lib/types";
import styles from "../../pieces/new/NewPieceForm.module.css";

const SUBDIVISIONS: { value: DrillSubdivision; label: string }[] = [
  { value: "quarter", label: "Quarter notes" },
  { value: "eighth", label: "Eighth notes" },
  { value: "triplet", label: "Eighth-note triplets" },
  { value: "sixteenth", label: "Sixteenth notes" },
];

export default function NewDrillForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [numerator, setNumerator] = useState(4);
  const [denominator, setDenominator] = useState(4);
  const [bpm, setBpm] = useState(90);
  const [bars, setBars] = useState(4);
  const [subdivision, setSubdivision] = useState<DrillSubdivision>("quarter");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          pattern: { timeSignature: { numerator, denominator }, bpm, bars, subdivision },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create drill.");
      router.push(`/drills/${body.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create drill.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <a href="/" className={styles.backLink}>
        ← All pieces
      </a>
      <h1 className={styles.title}>New rhythm drill</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eighth notes @ 90" autoFocus required />
        </label>
        <label className={styles.field}>
          <span>Time signature</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={1}
              max={32}
              value={numerator}
              onChange={(e) => setNumerator(Number(e.target.value))}
              style={{ width: 70 }}
              required
            />
            <span>/</span>
            <select value={denominator} onChange={(e) => setDenominator(Number(e.target.value))}>
              {[1, 2, 4, 8, 16].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className={styles.field}>
          <span>Tempo (BPM)</span>
          <input type="number" min={20} max={300} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} required />
        </label>
        <label className={styles.field}>
          <span>Bars</span>
          <input type="number" min={1} max={200} value={bars} onChange={(e) => setBars(Number(e.target.value))} required />
        </label>
        <label className={styles.field}>
          <span>Subdivision</span>
          <select value={subdivision} onChange={(e) => setSubdivision(e.target.value as DrillSubdivision)}>
            {SUBDIVISIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create drill"}
        </button>
      </form>
    </div>
  );
}
