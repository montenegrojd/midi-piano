"use client";

import { useEffect, useRef } from "react";
import { midiToName } from "@/lib/chords";
import { RECORD_TOGGLE_NOTE } from "@/lib/constants";
import styles from "./Keyboard.module.css";

const LOW = 21; // A0
const HIGH = 108; // C8
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BASE_WHITE_W = 26;
const BASE_BLACK_W = 16;
const BASE_WHITE_H = 190;
const BASE_BLACK_H = 116;
const BASE_DOT_SIZE = 8;

const KEYS = (() => {
  const list: { note: number; isBlack: boolean; isC: boolean; isRecordToggle: boolean }[] = [];
  for (let n = LOW; n <= HIGH; n++) {
    const pc = n % 12;
    const isBlack = BLACK_PITCH_CLASSES.has(pc);
    list.push({ note: n, isBlack, isC: !isBlack && pc === 0, isRecordToggle: n === RECORD_TOGGLE_NOTE });
  }
  return list;
})();
const WHITE_KEY_COUNT = KEYS.filter((k) => !k.isBlack).length;

interface KeyboardProps {
  activeNotes: Set<number>;
  sustainedNotes: Set<number>;
  onPress: (note: number) => void;
  onRelease: (note: number) => void;
}

/**
 * Renders the full 88-key keyboard and scales it to fill the available width — full-size on a
 * wide monitor, shrinks on narrow viewports, never below a usable minimum (falls back to
 * horizontal scroll there). Ported from the POC's layoutKeyboard() (midi-keyboard-poc.html).
 * The record-toggle key (A0) gets a red dot marker, like a record button.
 */
export default function Keyboard({ activeNotes, sustainedNotes, onPress, onRelease }: KeyboardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const keyRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const labelRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const dotRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  useEffect(() => {
    function layout() {
      const wrap = wrapRef.current;
      const keyboard = keyboardRef.current;
      if (!wrap || !keyboard) return;

      const availableWidth = wrap.clientWidth || BASE_WHITE_W * WHITE_KEY_COUNT;
      const scale = Math.min(2.0, Math.max(0.55, availableWidth / (BASE_WHITE_W * WHITE_KEY_COUNT)));
      const whiteW = BASE_WHITE_W * scale;
      const blackW = BASE_BLACK_W * scale;
      const whiteH = BASE_WHITE_H * scale;
      const blackH = BASE_BLACK_H * scale;

      let whiteX = 0;
      for (const k of KEYS) {
        const el = keyRefs.current[k.note];
        if (!el) continue;
        if (!k.isBlack) {
          el.style.left = `${whiteX}px`;
          el.style.width = `${whiteW}px`;
          el.style.height = `${whiteH}px`;
          const label = labelRefs.current[k.note];
          if (label) label.style.fontSize = `${Math.max(7, 8 * scale).toFixed(1)}px`;
          const dot = dotRefs.current[k.note];
          if (dot) {
            const size = Math.max(5, BASE_DOT_SIZE * scale);
            dot.style.width = `${size}px`;
            dot.style.height = `${size}px`;
          }
          whiteX += whiteW;
        } else {
          el.style.left = `${whiteX - blackW / 2}px`;
          el.style.width = `${blackW}px`;
          el.style.height = `${blackH}px`;
        }
      }
      keyboard.style.width = `${whiteX}px`;
      keyboard.style.height = `${whiteH}px`;
    }

    layout();
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(layout, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.keyboard} ref={keyboardRef}>
        {KEYS.map((k) => {
          const isActive = activeNotes.has(k.note);
          const isSustained = !isActive && sustainedNotes.has(k.note);
          const className = [styles.key, k.isBlack ? styles.black : styles.white, isActive ? styles.active : "", isSustained ? styles.sustained : ""]
            .join(" ")
            .trim();
          return (
            <div
              key={k.note}
              ref={(el) => {
                keyRefs.current[k.note] = el;
              }}
              className={className}
              onMouseDown={() => onPress(k.note)}
              onMouseUp={() => onRelease(k.note)}
              onMouseLeave={() => onRelease(k.note)}
            >
              {k.isC && (
                <span
                  className={styles.label}
                  ref={(el) => {
                    labelRefs.current[k.note] = el;
                  }}
                >
                  {midiToName(k.note)}
                </span>
              )}
              {k.isRecordToggle && (
                <span
                  className={styles.recordDot}
                  title="Start/stop recording"
                  ref={(el) => {
                    dotRefs.current[k.note] = el;
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
