"use client";

import { useEffect, useRef } from "react";
import { isUuid, shortCode, shortOf } from "@/entities/company-os/lib/slug";
import type { WorkboardCard } from "@/entities/company-os/modules/boards/workboard";
import type { Card } from "./board-view-types";

// Two-way sync between the open card and the browser URL (CU-01):
//  - on first load, open the card named by ?card=<slug> so a shared link
//    deep-links straight to it (runs once; the ref guards data-refresh re-runs);
//  - whenever the open card changes, reflect it in the address bar as
//    ?card=<friendly-slug> (and clear it on close), via replaceState so the
//    board's own history stays clean.
// The param is the friendly name+short-code slug (e.g. "fix-login-bug-030b0f26");
// a bare uuid still resolves, since older links used it.
export function useCardDeepLink(cards: WorkboardCard[], openCard: (c: Card) => void, openParam: string | null) {
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    const raw = new URLSearchParams(window.location.search).get("card");
    if (!raw) return;
    const c = isUuid(raw) ? cards.find((x) => x.id === raw) : cards.find((x) => shortCode(x.id) === shortOf(raw));
    if (c) {
      opened.current = true;
      openCard({ ...c, columnId: c.laneId });
    }
  }, [cards, openCard]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (openParam) url.searchParams.set("card", openParam);
    else url.searchParams.delete("card");
    window.history.replaceState(null, "", url);
  }, [openParam]);
}
