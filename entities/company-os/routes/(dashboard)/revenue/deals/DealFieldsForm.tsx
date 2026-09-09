"use client";

import { useAutosave } from "@/entities/company-os/ui/useAutosave";
import { AutosaveIndicator } from "@/entities/company-os/ui/AutosaveStatus";
import { updateDeal } from "./actions";
import { type DealCard, CURRENCIES } from "./types";

// The autosaving deal fields (title, amount, probability, dates, links). Each
// blur commits one field through updateDeal and mirrors the parsed value back
// onto the board's card through onPatch. Split out of DealDetail (Q3).

type DealFieldForm = {
  title: string;
  amount: string;
  currency: string;
  probability: string;
  expectedClose: string;
  source: string;
  nextStep: string;
  nextStepDate: string;
  proposalUrl: string;
  contractUrl: string;
};

export function DealFieldsForm({ card, onPatch }: { card: DealCard; onPatch: (patch: Partial<DealCard>) => void }) {
  const { form: dealForm, field: dealField, commit: dealCommit, status: dealStatus } = useAutosave<DealFieldForm>(
    {
      title: card.title ?? "",
      amount: card.amountCents != null ? (card.amountCents / 100).toString() : "",
      currency: (card.currency ?? "usd").toLowerCase(),
      probability: card.probability != null ? String(card.probability) : "",
      expectedClose: card.expectedClose ?? "",
      source: card.source ?? "",
      nextStep: card.nextStep ?? "",
      nextStepDate: card.nextStepDate ?? "",
      proposalUrl: card.proposalUrl ?? "",
      contractUrl: card.contractUrl ?? "",
    },
    saveDealField,
  );
  const { title, amount, currency, probability, expectedClose, source, nextStep, nextStepDate, proposalUrl, contractUrl } = dealForm;

  const currencyOptions = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

  // Each blur/change commits exactly one field — map it to the DealPatch shape

  async function saveDealField(patch: Partial<DealFieldForm>) {
    const [key, value] = Object.entries(patch)[0] as [keyof DealFieldForm, string];
    switch (key) {
      case "title": {
        const r = await updateDeal(card.id, { title: value });
        if (r.ok) onPatch({ title: value.trim() });
        return r;
      }
      case "amount": {
        const amt = value.trim() === "" ? 0 : Number(value);
        const r = await updateDeal(card.id, { amount: amt });
        if (r.ok) onPatch({ amountCents: Math.round(amt * 100) });
        return r;
      }
      case "currency": {
        const r = await updateDeal(card.id, { currency: value });
        if (r.ok) onPatch({ currency: value });
        return r;
      }
      case "probability": {
        const prob = value.trim() === "" ? null : Number(value);
        const r = await updateDeal(card.id, { probability: prob });
        if (r.ok) onPatch({ probability: prob });
        return r;
      }
      case "expectedClose": {
        const r = await updateDeal(card.id, { expected_close_date: value || null });
        if (r.ok) onPatch({ expectedClose: value || null });
        return r;
      }
      case "source": {
        const r = await updateDeal(card.id, { source: value.trim() || null });
        if (r.ok) onPatch({ source: value.trim() || null });
        return r;
      }
      case "nextStep": {
        const r = await updateDeal(card.id, { next_step: value.trim() || null });
        if (r.ok) onPatch({ nextStep: value.trim() || null });
        return r;
      }
      case "nextStepDate": {
        const r = await updateDeal(card.id, { next_step_date: value || null });
        if (r.ok) onPatch({ nextStepDate: value || null });
        return r;
      }
      case "proposalUrl": {
        const r = await updateDeal(card.id, { proposal_url: value.trim() || null });
        if (r.ok) onPatch({ proposalUrl: value.trim() || null });
        return r;
      }
      case "contractUrl": {
        const r = await updateDeal(card.id, { contract_url: value.trim() || null });
        if (r.ok) onPatch({ contractUrl: value.trim() || null });
        return r;
      }
      default:
        return { ok: true as const };
    }
  }

  return (
    <>
      <div className="admin-form">
        <div className="u-row u-end u-sm">
          <AutosaveIndicator status={dealStatus} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Title</label>
          <input
            className="admin-input"
            value={title}
            onChange={(e) => dealField("title", e.target.value)}
            onBlur={(e) => dealCommit("title", e.target.value)}
          />
        </div>
        <div className="u-grid-2-1">
          <div className="admin-field">
            <label className="admin-label">Amount</label>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => dealField("amount", e.target.value)}
              onBlur={(e) => dealCommit("amount", e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Currency</label>
            <select
              className="admin-select"
              value={currency}
              onChange={(e) => {
                dealField("currency", e.target.value);
                dealCommit("currency", e.target.value);
              }}
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="u-grid-2 u-gap-3">
          <div className="admin-field">
            <label className="admin-label">Probability %</label>
            <input
              className="admin-input"
              type="number"
              min="0"
              max="100"
              value={probability}
              onChange={(e) => dealField("probability", e.target.value)}
              onBlur={(e) => dealCommit("probability", e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Expected close</label>
            <input
              className="admin-input"
              type="date"
              value={expectedClose}
              onChange={(e) => {
                dealField("expectedClose", e.target.value);
                dealCommit("expectedClose", e.target.value);
              }}
            />
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Source</label>
          <input
            className="admin-input"
            value={source}
            onChange={(e) => dealField("source", e.target.value)}
            onBlur={(e) => dealCommit("source", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Next step</label>
          <input
            className="admin-input"
            placeholder="What happens next?"
            value={nextStep}
            onChange={(e) => dealField("nextStep", e.target.value)}
            onBlur={(e) => dealCommit("nextStep", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Next step date</label>
          <input
            className="admin-input"
            type="date"
            value={nextStepDate}
            onChange={(e) => {
              dealField("nextStepDate", e.target.value);
              dealCommit("nextStepDate", e.target.value);
            }}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Proposal link</label>
          <input
            className="admin-input"
            type="url"
            placeholder="https://…"
            value={proposalUrl}
            onChange={(e) => dealField("proposalUrl", e.target.value)}
            onBlur={(e) => dealCommit("proposalUrl", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Contract link</label>
          <input
            className="admin-input"
            type="url"
            placeholder="https://…"
            value={contractUrl}
            onChange={(e) => dealField("contractUrl", e.target.value)}
            onBlur={(e) => dealCommit("contractUrl", e.target.value)}
          />
        </div>
        {dealStatus.state === "error" && <div className="admin-alert admin-alert--err">{dealStatus.error}</div>}
      </div>
    </>
  );
}
