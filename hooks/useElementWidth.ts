import { useEffect, useState } from "react";

/**
 * Tracks an element's rendered width so SVG charts can size their viewBox to the space they
 * actually get, instead of a fixed width that letterboxes (blank sides) when the panel is wider.
 * Uses a callback ref so it still works when the element only renders conditionally.
 */
export function useElementWidth(fallback: number) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width) || fallback));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, fallback]);

  return { ref: setEl, width };
}
