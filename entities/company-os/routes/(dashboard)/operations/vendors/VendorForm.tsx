"use client";

import { useState } from "react";
import { humanize } from "@/kernel/ui/format";
import { VENDOR_RATINGS, VENDOR_TYPES, type VendorType } from "./vendor-shared";
import type { VendorInput } from "./actions";
import { useAutosave } from "@/entities/company-os/ui/useAutosave";
import { AutosaveIndicator } from "@/entities/company-os/ui/AutosaveStatus";

export type VendorFormValues = VendorInput;
type SaveResult = { ok: true } | { ok: false; error: string };

const EMPTY: VendorFormValues = {
  type: "other",
  name: "",
  price_range: "",
  address: "",
  phone: "",
  tax_id: "",
  bank_info: "",
  primary_contact_name: "",
  primary_contact_email: "",
  primary_contact_phone: "",
  secondary_contact_name: "",
  secondary_contact_email: "",
  secondary_contact_phone: "",
  rating: "",
  url: "",
  notes: "",
};

// Full vendor field set, shared by the "New vendor" page (a single explicit
// submit — there's no record to patch yet) and the shelf's edit mode, which
// passes `autosave` to persist each field on blur/change instead.
export function VendorForm({
  initial,
  submitLabel,
  onSubmit,
  autosave,
}: {
  initial?: Partial<VendorFormValues>;
  submitLabel?: string;
  onSubmit?: (values: VendorFormValues) => Promise<SaveResult>;
  autosave?: { onField: (patch: Partial<VendorFormValues>) => Promise<SaveResult>; onDone?: () => void };
}) {
  if (autosave) {
    return <VendorAutosaveForm initial={{ ...EMPTY, ...initial }} autosave={autosave} />;
  }
  return <VendorSubmitForm initial={{ ...EMPTY, ...initial }} submitLabel={submitLabel ?? "Save"} onSubmit={onSubmit!} />;
}

function VendorFields({
  form,
  onChange,
  onBlur,
}: {
  form: VendorFormValues;
  onChange: <K extends keyof VendorFormValues>(key: K, value: VendorFormValues[K]) => void;
  onBlur: <K extends keyof VendorFormValues>(key: K, value: VendorFormValues[K]) => void;
}) {
  const two = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
  return (
    <>
      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Type</label>
          <select
            className="admin-select"
            value={form.type}
            onChange={(e) => {
              const v = e.target.value as VendorType;
              onChange("type", v);
              onBlur("type", v);
            }}
          >
            {VENDOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">Name</label>
          <input
            className="admin-input"
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            onBlur={(e) => onBlur("name", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Price range</label>
        <input
          className="admin-input"
          value={form.price_range}
          onChange={(e) => onChange("price_range", e.target.value)}
          onBlur={(e) => onBlur("price_range", e.target.value)}
          placeholder="e.g. 1,900,000 VND/day"
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Address</label>
        <input
          className="admin-input"
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          onBlur={(e) => onBlur("address", e.target.value)}
        />
      </div>
      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Phone</label>
          <input
            className="admin-input"
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            onBlur={(e) => onBlur("phone", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">URL</label>
          <input
            className="admin-input"
            value={form.url}
            onChange={(e) => onChange("url", e.target.value)}
            onBlur={(e) => onBlur("url", e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Tax ID</label>
          <input
            className="admin-input"
            value={form.tax_id}
            onChange={(e) => onChange("tax_id", e.target.value)}
            onBlur={(e) => onBlur("tax_id", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Rating</label>
          <select
            className="admin-select"
            value={form.rating}
            onChange={(e) => {
              onChange("rating", e.target.value);
              onBlur("rating", e.target.value);
            }}
          >
            <option value="">—</option>
            {VENDOR_RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Bank info</label>
        <input
          className="admin-input"
          value={form.bank_info}
          onChange={(e) => onChange("bank_info", e.target.value)}
          onBlur={(e) => onBlur("bank_info", e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Primary contact</label>
        <div className="u-grid-auto-sm">
          <input
            className="admin-input"
            value={form.primary_contact_name}
            onChange={(e) => onChange("primary_contact_name", e.target.value)}
            onBlur={(e) => onBlur("primary_contact_name", e.target.value)}
            placeholder="Name"
          />
          <input
            className="admin-input"
            type="email"
            value={form.primary_contact_email}
            onChange={(e) => onChange("primary_contact_email", e.target.value)}
            onBlur={(e) => onBlur("primary_contact_email", e.target.value)}
            placeholder="Email"
          />
          <input
            className="admin-input"
            value={form.primary_contact_phone}
            onChange={(e) => onChange("primary_contact_phone", e.target.value)}
            onBlur={(e) => onBlur("primary_contact_phone", e.target.value)}
            placeholder="Phone"
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Secondary contact</label>
        <div className="u-grid-auto-sm">
          <input
            className="admin-input"
            value={form.secondary_contact_name}
            onChange={(e) => onChange("secondary_contact_name", e.target.value)}
            onBlur={(e) => onBlur("secondary_contact_name", e.target.value)}
            placeholder="Name"
          />
          <input
            className="admin-input"
            type="email"
            value={form.secondary_contact_email}
            onChange={(e) => onChange("secondary_contact_email", e.target.value)}
            onBlur={(e) => onBlur("secondary_contact_email", e.target.value)}
            placeholder="Email"
          />
          <input
            className="admin-input"
            value={form.secondary_contact_phone}
            onChange={(e) => onChange("secondary_contact_phone", e.target.value)}
            onBlur={(e) => onBlur("secondary_contact_phone", e.target.value)}
            placeholder="Phone"
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Notes</label>
        <textarea
          className="admin-textarea"
          rows={4}
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          onBlur={(e) => onBlur("notes", e.target.value)}
        />
      </div>
    </>
  );
}

function VendorSubmitForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: VendorFormValues;
  submitLabel: string;
  onSubmit: (values: VendorFormValues) => Promise<SaveResult>;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<VendorFormValues>(initial);

  function field<K extends keyof VendorFormValues>(key: K, value: VendorFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const r = await onSubmit(form);
    setSaving(false);
    if (!r.ok) setMsg({ ok: false, text: r.error });
  }

  return (
    <form className="admin-form" onSubmit={save}>
      {msg && <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>}
      <VendorFields form={form} onChange={field} onBlur={() => {}} />
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function VendorAutosaveForm({
  initial,
  autosave,
}: {
  initial: VendorFormValues;
  autosave: { onField: (patch: Partial<VendorFormValues>) => Promise<SaveResult>; onDone?: () => void };
}) {
  const { form, field, commit, status } = useAutosave(initial, autosave.onField);

  return (
    <div className="admin-form">
      <div className="u-row u-end u-sm">
        <AutosaveIndicator status={status} />
      </div>
      <VendorFields form={form} onChange={field} onBlur={commit} />
      {status.state === "error" && <div className="admin-alert admin-alert--err">{status.error}</div>}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={autosave.onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
