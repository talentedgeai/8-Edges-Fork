"use client";

// Shared deal record fields, used by both the pipeline board's DealDetail shelf
// (still opened by the revenue cockpit) and the full-page DealManage record.
// Kept in their own module — free of @hello-pangea/dnd — so the detail page
// doesn't pull the board's drag dependency into its bundle.

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, humanize } from "@/kernel/ui/format";
import {
  addDealCommunication,
  createReferrerForDeal,
  getDealCommunications,
  searchCompanies,
  searchPeople,
  setDealReferrer,
  setDealReferrerCompany,
  type Communication,
  type CompanyHit,
  type PersonHit,
} from "./actions";

// The deal's referrer — the contact who sent the introduction. Type to search
// existing contacts; if they're not in the CRM yet, add them (name + email) as
// a real contact in one step. One referrer per deal.
export function ReferrerField({
  dealId,
  referrerId,
  referrerName,
  onChange,
}: {
  dealId: string;
  referrerId: string | null;
  referrerName: string | null;
  onChange: (referrerId: string | null, referrerName: string | null) => void;
}) {
  const [mode, setMode] = useState<"idle" | "search" | "new">("idle");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Debounced typeahead, only while the search box is open.
  useEffect(() => {
    if (mode !== "search") return;
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchPeople(q);
      setHits(r);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [term, mode]);

  function reset() {
    setMode("idle");
    setTerm("");
    setHits([]);
    setErr(null);
    setNewName("");
    setNewEmail("");
  }

  async function link(hit: PersonHit) {
    setBusy(true);
    setErr(null);
    const r = await setDealReferrer(dealId, hit.id);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onChange(r.referrer?.id ?? null, r.referrer?.name ?? null);
    reset();
  }

  async function clear() {
    setBusy(true);
    setErr(null);
    const r = await setDealReferrer(dealId, null);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onChange(null, null);
    reset();
  }

  async function createNew() {
    setBusy(true);
    setErr(null);
    const r = await createReferrerForDeal(dealId, newName, newEmail);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onChange(r.referrer.id, r.referrer.name);
    reset();
  }

  return (
    <div className="u-mb-4">
      <div className="admin-label u-mb-2">
        Referrer
      </div>

      {mode === "idle" &&
        (referrerId ? (
          <div className="admin-deal-inline-row">
            <Link href={`/admin/contacts/${referrerId}`} className="admin-cell-strong">
              {referrerName || "View contact"}
            </Link>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")} disabled={busy}>
              Change
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={clear} disabled={busy}>
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")}>
            Add referrer
          </button>
        ))}

      {mode === "search" && (
        <div className="admin-deal-field-stack">
          <input
            className="admin-input"
            autoFocus
            placeholder="Search contacts by name or email…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {term.trim().length >= 2 && (
            <div
              className="admin-scroll-sm admin-box"
            >
              {searching ? (
                <div className="admin-hint u-p-2">
                  Searching…
                </div>
              ) : hits.length === 0 ? (
                <div className="admin-hint u-p-2">
                  No matching contacts. Add them as a new contact below.
                </div>
              ) : (
                hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => link(h)}
                    disabled={busy}
                    className="admin-deal-option"
                  >
                    <span className="admin-cell-strong">{h.name}</span>
                    <span className="admin-cell-muted">{h.email}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="admin-deal-btn-row">
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              onClick={() => {
                setNewName(term.trim());
                setNewEmail("");
                setErr(null);
                setMode("new");
              }}
            >
              + Add new contact
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "new" && (
        <div className="admin-deal-field-stack">
          <div className="admin-field">
            <label className="admin-label">Name</label>
            <input className="admin-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="admin-field">
            <label className="admin-label">Email</label>
            <input className="admin-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="admin-deal-btn-row">
            <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={createNew} disabled={busy}>
              {busy ? "Saving…" : "Create & link"}
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")} disabled={busy}>
              Back
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {err}
        </div>
      )}
    </div>
  );
}

// The deal's referring company — the org that sent the introduction. Type to
// search existing companies and pick one. Separate from the person referrer
// above; companies are picked here, not created. One referring company per deal.
export function ReferrerCompanyField({
  dealId,
  referrerCompanyId,
  referrerCompanyName,
  onChange,
}: {
  dealId: string;
  referrerCompanyId: string | null;
  referrerCompanyName: string | null;
  onChange: (referrerCompanyId: string | null, referrerCompanyName: string | null) => void;
}) {
  const [mode, setMode] = useState<"idle" | "search">("idle");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debounced typeahead, only while the search box is open.
  useEffect(() => {
    if (mode !== "search") return;
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchCompanies(q);
      setHits(r);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [term, mode]);

  function reset() {
    setMode("idle");
    setTerm("");
    setHits([]);
    setErr(null);
  }

  async function link(hit: CompanyHit) {
    setBusy(true);
    setErr(null);
    const r = await setDealReferrerCompany(dealId, hit.id);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onChange(r.referrerCompany?.id ?? null, r.referrerCompany?.name ?? null);
    reset();
  }

  async function clear() {
    setBusy(true);
    setErr(null);
    const r = await setDealReferrerCompany(dealId, null);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onChange(null, null);
    reset();
  }

  return (
    <div className="u-mb-4">
      <div className="admin-label u-mb-2">
        Referring company
      </div>

      {mode === "idle" &&
        (referrerCompanyId ? (
          <div className="admin-deal-inline-row">
            <Link href={`/admin/revenue/companies/${referrerCompanyId}`} className="admin-cell-strong">
              {referrerCompanyName || "View company"}
            </Link>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")} disabled={busy}>
              Change
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={clear} disabled={busy}>
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")}>
            Add referring company
          </button>
        ))}

      {mode === "search" && (
        <div className="admin-deal-field-stack">
          <input
            className="admin-input"
            autoFocus
            placeholder="Search companies by name…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {term.trim().length >= 2 && (
            <div
              className="admin-scroll-sm admin-box"
            >
              {searching ? (
                <div className="admin-hint u-p-2">
                  Searching…
                </div>
              ) : hits.length === 0 ? (
                <div className="admin-hint u-p-2">
                  No matching companies.
                </div>
              ) : (
                hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => link(h)}
                    disabled={busy}
                    className="admin-deal-option"
                  >
                    <span className="admin-cell-strong">{h.name || "Unnamed company"}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="admin-deal-btn-row">
            <button type="button" className="admin-btn admin-btn--sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {err}
        </div>
      )}
    </div>
  );
}

// A deal's communication log. Free-text entries append to the shared activity
// log (interactions), newest first. Automatic stage-change rows are filtered out
// server-side so this reads as a human conversation history.
export function DealCommunications({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadErr(null);
    getDealCommunications(dealId).then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.items);
      else setLoadErr(r.error);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [dealId]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setSaveErr(null);
    const r = await addDealCommunication(dealId, text);
    setSaving(false);
    if (!r.ok) return setSaveErr(r.error);
    setItems((cur) => [r.item, ...cur]);
    setBody("");
  }

  return (
    <div className="u-mt-4">
      <div className="admin-label u-mb-2">
        Communications
      </div>

      <div className="admin-field">
        <textarea
          className="admin-input"
          rows={3}
          placeholder="Log a call, email, or note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="admin-form-actions u-mb-3">
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={add} disabled={saving || !body.trim()}>
          {saving ? "Adding…" : "Add communication"}
        </button>
      </div>
      {saveErr && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {saveErr}
        </div>
      )}

      {loading ? (
        <div className="admin-hint">Loading…</div>
      ) : loadErr ? (
        <div className="admin-alert admin-alert--err">{loadErr}</div>
      ) : items.length === 0 ? (
        <div className="admin-empty">No communications yet.</div>
      ) : (
        <ul className="admin-deal-comm-list">
          {items.map((c) => (
            <li
              key={c.id}
              className="admin-quote"
            >
              <div className="admin-cell-muted u-mb-1">
                {humanize(c.kind)} · {formatDate(c.occurredAt)}
              </div>
              <div className="u-prewrap">{c.body || c.subject || "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
