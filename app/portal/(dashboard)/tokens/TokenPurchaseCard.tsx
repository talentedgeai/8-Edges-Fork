"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@/lib/admin/format";
import { purchaseTokenPacks } from "./actions";

const PACK_TOKENS = 40;
const PACK_PRICE_CENTS = 200_000;
const MAX_PACKS = 4;

// Pick 1-4 packs → Stripe Checkout. Constants mirrored from
// lib/portal/tokens.ts (server lib; not importable into a client component).
export function TokenPurchaseCard() {
  const [packs, setPacks] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function buy() {
    setErr(null);
    start(async () => {
      const r = await purchaseTokenPacks(packs);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      window.location.href = r.checkoutUrl;
    });
  }

  return (
    <div className="u-stack u-gap-3">
      <div className="u-row u-wrap">
        {Array.from({ length: MAX_PACKS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={n === packs ? "admin-btn admin-btn--primary" : "admin-btn"}
            onClick={() => setPacks(n)}
            disabled={pending}
          >
            {n} {n === 1 ? "pack" : "packs"}
          </button>
        ))}
      </div>
      <div className="u-sm">
        {packs * PACK_TOKENS} tokens · <strong>{formatCents(packs * PACK_PRICE_CENTS, "usd")}</strong>
      </div>
      {err && <div className="admin-alert admin-alert--err">{err}</div>}
      <div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={buy} disabled={pending}>
          {pending ? "Starting checkout…" : "Pay with card"}
        </button>
      </div>
    </div>
  );
}
