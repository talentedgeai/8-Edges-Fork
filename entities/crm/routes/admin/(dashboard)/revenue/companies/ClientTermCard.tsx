"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/kernel/ui/format";
import { updateCompany } from "@/entities/crm/lib/companies-actions";
import { parseTypedDate } from "@/entities/crm/lib/client-term";

type Field = "client_start_date" | "client_end_date";

// The client relationship's start and end dates. Read-only until Edit, like the
// Details card. The fields are plain text rather than the browser date picker,
// which is slow to type into: any common format is read on blur or Enter,
// saved, and echoed back in the page's date format.
export function ClientTermCard({
  companyId,
  startDate,
  endDate,
}: {
  companyId: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(field: Field, input: HTMLInputElement, current: string | null) {
    const parsed = parseTypedDate(input.value);
    if (parsed === null) {
      setError(`Couldn't read "${input.value}". Type a date like 16/9/2026 or 16 Sep 2026.`);
      return;
    }
    setError(null);
    if (parsed === (current ?? "")) return;
    const r = await updateCompany(companyId, { [field]: parsed });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    input.value = parsed ? formatDate(parsed) : "";
    router.refresh();
  }

  function dateField(field: Field, label: string, current: string | null, placeholder: string) {
    return (
      <div className="admin-field">
        <label className="admin-label" htmlFor={field}>{label}</label>
        <input
          id={field}
          className="admin-input"
          defaultValue={current ? formatDate(current) : ""}
          placeholder={placeholder}
          onBlur={(e) => save(field, e.currentTarget, current)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </div>
    );
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Client relationship</h2>
        <button type="button" className="admin-btn" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="u-grid-2 u-gap-3">
          {dateField("client_start_date", "Start date", startDate, "16/9/2026")}
          {dateField("client_end_date", "End date", endDate, "Blank for open-ended")}
        </div>
      ) : (
        <dl className="admin-kv">
          <dt>Start date</dt>
          <dd>{formatDate(startDate)}</dd>
          <dt>End date</dt>
          <dd>{endDate ? formatDate(endDate) : "Open-ended"}</dd>
        </dl>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <p className="admin-cell-muted u-sm u-mt-4 u-mb-1">
        Dates are for reference: the hub and portal access stay on after the end date until you turn them off.
      </p>
    </div>
  );
}
