"use client";

import { useEffect, useState } from "react";

/**
 * Světlý / tmavý / podle systému.
 *
 * The palette already has a dark stepping for `prefers-color-scheme`; this
 * only lets the viewer override it through `data-theme` on <html>, which the
 * stylesheet honours either way. The choice is a per-browser convenience, so
 * localStorage is enough — and the inline script in layout.tsx applies it
 * before first paint, so a dark choice never flashes white on load.
 */

export const THEME_KEY = "stocksanalyzer.theme";

type Volba = "system" | "light" | "dark";

const VOLBY: { id: Volba; label: string; title: string }[] = [
  { id: "system", label: "Auto", title: "Podle nastavení systému" },
  { id: "light", label: "Světlý", title: "Vždy světlý režim" },
  { id: "dark", label: "Tmavý", title: "Vždy tmavý režim" },
];

function apply(v: Volba) {
  if (v === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
}

export function ThemeToggle() {
  const [volba, setVolba] = useState<Volba>("system");

  // Read after mount: the server render cannot know what this browser chose.
  useEffect(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v === "light" || v === "dark") setVolba(v);
    } catch {
      /* storage blocked — stays on the system setting */
    }
  }, []);

  const zvol = (v: Volba) => {
    setVolba(v);
    apply(v);
    try {
      if (v === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, v);
    } catch {
      /* not remembered, still applied for this visit */
    }
  };

  return (
    <div role="group" aria-label="Barevný režim" style={{ display: "flex", gap: "0.3rem" }}>
      {VOLBY.map((o) => (
        <button
          key={o.id}
          className="btn"
          aria-pressed={volba === o.id}
          onClick={() => zvol(o.id)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
