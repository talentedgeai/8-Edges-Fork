"use client";

import { useState, type ReactNode } from "react";

export type TabDef = { key: string; label: string; count?: number; content: ReactNode };

// Server-rendered tab content is passed in as ReactNode (RSC payload) — all
// panels are rendered upfront from already-fetched data; this only toggles which
// is visible. initialKey lets a page open on a specific tab (e.g. from a ?tab=
// param); an unknown key falls back to the first tab. syncParam additionally
// writes the active key into that URL query param on click (history.replaceState,
// no navigation), so URL-driven islands inside a panel (search, pagination)
// round-trip back to the same tab. Without both props, behavior is unchanged.
export function Tabs({
  tabs,
  initialKey,
  syncParam,
}: {
  tabs: TabDef[];
  initialKey?: string;
  syncParam?: string;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initialKey) ? initialKey : tabs[0]?.key,
  );
  function select(key: string) {
    setActive(key);
    if (syncParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set(syncParam, key);
      window.history.replaceState(null, "", url.toString());
    }
  }
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div>
      <div className="admin-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === active}
            className={`admin-tab${t.key === active ? " is-active" : ""}`}
            onClick={() => select(t.key)}
          >
            {t.label}
            {typeof t.count === "number" ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>
      <div className="admin-tab-panel">{current?.content}</div>
    </div>
  );
}
