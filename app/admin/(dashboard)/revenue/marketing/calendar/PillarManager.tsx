"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/admin/Badge";
import type { BrandOption, PillarOption } from "@/lib/admin/marketing-calendar";
import { createPillar, deactivatePillar } from "./actions";

// Per-brand content pillars. Intentionally unseeded: the operator defines their
// own strategy here, and the entry pickers read from this list.
export function PillarManager({
  brands,
  pillars,
  onCreated,
  onRemoved,
}: {
  brands: BrandOption[];
  pillars: PillarOption[];
  onCreated: (pillar: PillarOption) => void;
  onRemoved: (id: string) => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const forBrand = pillars.filter((p) => p.brandId === brandId);

  function add() {
    setNote(null);
    startTransition(async () => {
      const r = await createPillar(brandId, name);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      onCreated(r.pillar);
      setName("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deactivatePillar(id);
      if (r.ok) onRemoved(id);
      else setNote(r.error);
    });
  }

  return (
    <div className="admin-form u-mt-3">
      <div className="u-row u-items-end u-gap-3 u-wrap">
        <div className="admin-field u-flex-1">
          <label className="admin-label" htmlFor="pm-brand">Brand</label>
          <select id="pm-brand" className="admin-input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="admin-field u-flex-2">
          <label className="admin-label" htmlFor="pm-name">New pillar</label>
          <input id="pm-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Proof-based certification" />
        </div>
        <button type="button" className="admin-btn" onClick={add} disabled={pending || !brandId || !name.trim()}>
          Add pillar
        </button>
      </div>

      {note && <div className="admin-alert admin-alert--err u-mt-2">{note}</div>}

      <div className="u-row u-wrap u-mt-3">
        {forBrand.length === 0 ? (
          <span className="admin-hint">No pillars yet for this brand.</span>
        ) : (
          forBrand.map((p) => (
            <span key={p.id} className="u-row">
              <Badge>{p.name}</Badge>
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                title="Retire this pillar"
                disabled={pending}
                onClick={() => remove(p.id)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
