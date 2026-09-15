"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTeamMemberPermission } from "../permission-actions";

// The admin switch for the `revenue` team-portal permission, as one row of the
// profile's Employment list. It saves on change and puts the box back if the
// save fails, so it never shows a grant that did not land.
export function RevenueAccessToggle({ teamMemberId, permissions }: { teamMemberId: string; permissions?: string[] | null }) {
  const router = useRouter();
  const [on, setOn] = useState(Boolean(permissions?.includes("revenue")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setOn(next);
    setSaving(true);
    const res = await setTeamMemberPermission(teamMemberId, "revenue", next);
    setSaving(false);
    if (!res.ok) {
      setOn(!next);
      setError(res.error);
      return;
    }
    setError(null);
    router.refresh();
  }

  return (
    <>
      <dt>Revenue access</dt>
      <dd>
        <label className="u-row u-sm">
          <input type="checkbox" checked={on} disabled={saving} onChange={(e) => void toggle(e.target.checked)} />
          <span>{on ? "Can use Revenue in the team portal" : "No access"}</span>
        </label>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
      </dd>
    </>
  );
}
