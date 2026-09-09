"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBoughtTokens } from "@/entities/company-os/modules/crm/token-allocation-actions";
import { TOKEN_ALLOCATION_KINDS, TOKEN_ALLOCATION_KIND_LABELS } from "@/entities/htt/client";
import type { TokenAllocation } from "@/entities/htt";
import { formatDate } from "@/kernel/ui/format";

// The admin's control over a client's Bought tokens: a button under the Human
// Tokens band that opens a small form (new total, kind, reason) and a
// collapsible history of every figure ever set. Admin only; the team and
// portal hubs render the band read-only.
export function SetBoughtTokens({
  companyId,
  current,
  history,
}: {
  companyId: string;
  current: number; // the Bought figure the band shows (purchased + allocated)
  history: TokenAllocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tokens, setTokens] = useState(String(current));
  const [kind, setKind] = useState<string>("purchased");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const n = Number(tokens);
    if (!Number.isFinite(n)) {
      setError("Enter a number of tokens.");
      return;
    }
    start(async () => {
      const r = await setBoughtTokens({ companyId, tokens: n, kind, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="admin-card admin-section-card u-mb-5">
      <div className="u-row u-wrap u-between">
        <div>
          <div className="admin-card-title">Bought tokens</div>
          <div className="admin-cell-muted u-sm">
            The Bought figure is set by hand: a purchase, a referral credit applied, a retreat or complimentary allotment, an invoiced pack, or a correction.
          </div>
        </div>
        <div className="u-row">
          {history.length > 0 && (
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Hide history" : `History (${history.length})`}
            </button>
          )}
          <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Set bought"}
          </button>
        </div>
      </div>

      {open && (
        <div className="u-stack u-gap-3 u-mt-3">
          <div className="u-row u-wrap u-gap-3">
            <label className="u-stack u-gap-1">
              <span className="admin-cell-muted u-sm">New Bought total</span>
              <input type="number" min={0} step={1} className="admin-input" value={tokens} onChange={(e) => setTokens(e.target.value)} disabled={pending} />
            </label>
            <label className="u-stack u-gap-1">
              <span className="admin-cell-muted u-sm">Kind</span>
              <select className="admin-select" value={kind} onChange={(e) => setKind(e.target.value)} disabled={pending}>
                {TOKEN_ALLOCATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TOKEN_ALLOCATION_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="u-stack u-gap-1">
            <span className="admin-cell-muted u-sm">Reason</span>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. 55 purchased plus 19 referral credit applied"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </label>
          {error && <div className="admin-alert admin-alert--err">{error}</div>}
          <div className="u-row">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={submit}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="admin-list u-mt-3">
          {history.map((h) => (
            <div className="admin-list-row" key={h.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">
                  {h.tokens == null ? "Removed" : `${h.tokens.toLocaleString()} tokens`}
                  {h.kind && <span className="admin-cell-muted"> · {TOKEN_ALLOCATION_KIND_LABELS[h.kind]}</span>}
                </div>
                <div className="admin-list-sub">{h.reason ?? "No reason recorded"}</div>
              </div>
              <div className="admin-list-aside">
                <span className="admin-cell-muted u-sm">
                  {formatDate(h.setAt)} · {h.setByEmail}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
