"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VALUE_ICONS, type ValueRow } from "@/entities/company-os/ui/company/CoreValuesGrid";
import { createValue, deleteValue, moveValue, updateValue } from "../actions";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

// Full editor for company_os.core_values, the one Company dataset with no
// editor before now. Add, edit inline, reorder (the team page's glyphs follow
// sort_order), and delete. The read-only team grid renders the same rows.
type Form = { title: string; description: string };

export function ValuesEditor({ values }: { values: ValueRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ title: "", description: "" });

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setBanner({ tone: "ok", text: okText });
        setAdding(false);
        setEditingId(null);
        setForm({ title: "", description: "" });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function openAdd() {
    setEditingId(null);
    setForm({ title: "", description: "" });
    setAdding(true);
    setBanner(null);
  }
  function openEdit(v: ValueRow) {
    setAdding(false);
    setEditingId(v.id);
    setForm({ title: v.title, description: v.description });
    setBanner(null);
  }
  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm({ title: "", description: "" });
  }

  const editForm = (submit: (e: React.FormEvent) => void, label: string) => (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-field">
        <label className="admin-label" htmlFor="val-title">
          Value
        </label>
        <input
          id="val-title"
          className="admin-input"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Learn and Share"
          maxLength={80}
          required
        />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="val-desc">
          What it means
        </label>
        <textarea
          id="val-desc"
          className="admin-textarea"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          required
        />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
        <button type="button" className="admin-btn" onClick={cancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div>
      {banner && <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>{banner.text}</div>}

      {adding ? (
        <div className="admin-card admin-section-card u-mb-5">
          <h2 className="admin-card-title">Add a value</h2>
          {editForm((e) => {
            e.preventDefault();
            run(() => createValue(form), "Value added.");
          }, "Add value")}
        </div>
      ) : (
        <div className="admin-form-actions u-mb-5">
          <button className="admin-btn admin-btn--primary" onClick={openAdd} disabled={pending}>
            Add a value
          </button>
        </div>
      )}

      {values.length === 0 && !adding && <div className="admin-empty">No values yet. Add the first one.</div>}

      <div className="admin-team-values-grid">
        {values.map((v, i) => (
          <div key={v.id} className="admin-team-value-card">
            {editingId === v.id ? (
              editForm((e) => {
                e.preventDefault();
                run(() => updateValue(v.id, form), "Value updated.");
              }, "Save value")
            ) : (
              <>
                <span className="admin-team-value-head">
                  <span className="admin-team-value-num" aria-hidden>
                    {VALUE_ICONS[i % VALUE_ICONS.length]}
                  </span>
                  <span className="admin-team-value-title">{v.title}</span>
                </span>
                <span className="admin-team-value-body">{v.description}</span>
                <div className="admin-form-actions u-mt-3">
                  <button
                    className="admin-btn admin-btn--sm"
                    onClick={() => run(() => moveValue(v.id, "up"), "Reordered.")}
                    disabled={pending || i === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="admin-btn admin-btn--sm"
                    onClick={() => run(() => moveValue(v.id, "down"), "Reordered.")}
                    disabled={pending || i === values.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button className="admin-btn admin-btn--sm" onClick={() => openEdit(v)} disabled={pending}>
                    Edit
                  </button>
                  <ConfirmButton
                    label="Delete"
                    className="admin-btn admin-btn--sm"
                    title={`Delete "${v.title}"?`}
                    body="The value is removed from the team page and its glyph order closes up."
                    confirmLabel="Delete"
                    disabled={pending}
                    onConfirm={() => deleteValue(v.id)}
                    onDone={() => {
                      setBanner({ tone: "ok", text: "Value deleted." });
                      router.refresh();
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
