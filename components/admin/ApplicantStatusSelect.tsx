"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APPLICATION_STATUS_OPTIONS } from "@/lib/admin/application-status";
import { updateApplication } from "@/app/admin/(dashboard)/talent/applications/actions";

// The single applicant-status control used on all three talent surfaces: the
// contact 360 header, the applications shelf, and the rank shelf. It writes
// through the shared, admin-gated updateApplication action and refreshes so any
// status badges on the surrounding list/tab reflect the new value. The value is
// applied optimistically and reverts if the save fails.
export function ApplicantStatusSelect({
  applicationId,
  status,
  label,
}: {
  applicationId: string;
  status: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status ?? "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    const res = await updateApplication(applicationId, { status: next });
    setSaving(false);
    if (!res.ok) {
      setValue(prev);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="admin-field u-inline-stack u-m-0">
      {label && (
        <label className="admin-label">
          {label}
          {saving ? <span className="admin-cell-muted"> · saving…</span> : null}
        </label>
      )}
      <select
        className="admin-select"
        aria-label={label ?? "Applicant status"}
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
      >
        {APPLICATION_STATUS_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {error && <span className="admin-alert admin-alert--err">{error}</span>}
    </span>
  );
}
