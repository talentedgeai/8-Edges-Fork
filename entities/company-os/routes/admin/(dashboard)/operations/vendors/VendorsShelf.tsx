"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { humanize } from "@/kernel/ui/format";
import type { VendorRow } from "./vendor-shared";
import { archiveVendor, restoreVendor, updateVendor } from "./actions";
import { VendorForm, type VendorFormValues } from "./VendorForm";

// Client-owned shelf for the vendors list. One drawer lives at the provider
// level; rows only push the selected vendor into context. The list query
// already selects every vendor column, so the shelf works off the row directly
// (no lazy fetch) — and never goes through DataTable's server-rendered
// getRowPreview (interactive content there renders with dead clicks).

const ShelfContext = createContext<{ open: (row: VendorRow) => void } | null>(null);

export function VendorsShelfProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<VendorRow | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Vendor"
        title={selected?.name ?? ""}
      >
        {selected && <VendorShelfBody row={selected} onClose={() => setSelected(null)} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function VendorShelfRow({ row, children }: { row: VendorRow; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  // The row itself carries role="button", so exclude it from the interactive-
  // element guard — closest() matches the element AND its ancestors, and a
  // guard that can match the row swallows every click (dead shelf).
  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

function kv(label: string, value: ReactNode) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function VendorShelfBody({ row, onClose }: { row: VendorRow; onClose: () => void }) {
  const router = useRouter();
  // Local copy so an inline save reflects immediately without refetching.
  const [vendor, setVendor] = useState(row);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setVendor(row);
    setEditing(false);
  }, [row]);

  async function saveField(patch: Partial<VendorFormValues>) {
    const r = await updateVendor(vendor.id, patch);
    if (r.ok) {
      setVendor((v) => ({ ...v, ...patch }));
      router.refresh();
    }
    return r;
  }

  if (editing) {
    return (
      <div className="admin-shelf-sections">
        <section>
          <div className="admin-shelf-heading">Edit vendor</div>
          <VendorForm
            initial={{
              type: (vendor.type as VendorFormValues["type"]) ?? "other",
              name: vendor.name,
              price_range: vendor.price_range ?? "",
              address: vendor.address ?? "",
              phone: vendor.phone ?? "",
              tax_id: vendor.tax_id ?? "",
              bank_info: vendor.bank_info ?? "",
              primary_contact_name: vendor.primary_contact_name ?? "",
              primary_contact_email: vendor.primary_contact_email ?? "",
              primary_contact_phone: vendor.primary_contact_phone ?? "",
              secondary_contact_name: vendor.secondary_contact_name ?? "",
              secondary_contact_email: vendor.secondary_contact_email ?? "",
              secondary_contact_phone: vendor.secondary_contact_phone ?? "",
              rating: vendor.rating ?? "",
              url: vendor.url ?? "",
              notes: vendor.notes ?? "",
            }}
            autosave={{ onField: saveField, onDone: () => setEditing(false) }}
          />
        </section>
      </div>
    );
  }

  const primary = [vendor.primary_contact_name, vendor.primary_contact_email, vendor.primary_contact_phone]
    .filter(Boolean)
    .join(" · ");
  const secondary = [vendor.secondary_contact_name, vendor.secondary_contact_email, vendor.secondary_contact_phone]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">
          Details
          <button type="button" className="admin-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <dl className="admin-kv">
          {kv("Type", humanize(vendor.type))}
          {kv("Rating", vendor.rating)}
          {kv("Price range", vendor.price_range)}
          {kv("Address", vendor.address)}
          {kv("Phone", vendor.phone)}
          {kv("Tax ID", vendor.tax_id)}
          {kv("Bank info", vendor.bank_info)}
          {kv(
            "URL",
            vendor.url && (
              <a href={vendor.url} target="_blank" rel="noreferrer">
                {vendor.url}
              </a>
            ),
          )}
          {kv("Primary contact", primary)}
          {kv("Secondary contact", secondary)}
        </dl>
      </section>

      {vendor.notes && (
        <section>
          <div className="admin-shelf-heading">Notes</div>
          <div className="u-prewrap">{vendor.notes}</div>
        </section>
      )}

      <section>
        <div className="admin-shelf-heading">{vendor.archived_at ? "Archived" : "Archive"}</div>
        {vendor.archived_at ? (
          <ConfirmButton
            className="admin-btn"
            label="Restore vendor"
            title="Restore vendor"
            body={`Restore ${vendor.name} to the active vendor list?`}
            confirmLabel="Restore"
            onConfirm={() => restoreVendor(vendor.id)}
            onDone={() => {
              onClose();
              router.refresh();
            }}
          />
        ) : (
          <ConfirmButton
            label="Archive vendor"
            title="Archive vendor"
            body={`Archive ${vendor.name}? It disappears from the list but can be restored from the archived view.`}
            confirmLabel="Archive"
            onConfirm={() => archiveVendor(vendor.id)}
            onDone={() => {
              onClose();
              router.refresh();
            }}
          />
        )}
      </section>
    </div>
  );
}
