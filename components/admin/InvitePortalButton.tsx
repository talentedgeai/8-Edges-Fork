"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  inviteToPortal,
  resendPortalInvite,
  revokePortalAccess,
} from "@/app/admin/(dashboard)/talent/team/actions";
import type { PortalStatus } from "@/lib/admin/portal-status";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Talent > Team portal-access control, three states:
//   none    → an Invite button (confirms first — it emails a real sign-in link)
//   invited → an "Invited" badge + a Resend link (they haven't signed in yet)
//   active  → a "Signed in" badge
// `full` (the member detail page) adds a Revoke button to the linked states.
export function InvitePortalButton({
  teamMemberId,
  status,
  full = false,
}: {
  teamMemberId: string;
  status: PortalStatus;
  full?: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  // Each button is a ConfirmButton: the modal shows the action's error itself,
  // so only the success message lands in the inline `msg` slot.
  async function run(action: (id: string) => Promise<Result>): Promise<Result> {
    setMsg(null);
    const res = await action(teamMemberId);
    if (res.ok) setMsg(res.message);
    return res;
  }

  if (status === "none") {
    return (
      <span className="u-row">
        <ConfirmButton
          label="Invite"
          className="admin-btn admin-btn--sm"
          title="Invite to the portal?"
          body="Sends this person a portal sign-in invite by email."
          confirmLabel="Send invite"
          onConfirm={() => run(inviteToPortal)}
          onDone={() => router.refresh()}
        />
        {msg && <span className="admin-cell-muted">{msg}</span>}
      </span>
    );
  }

  const badge =
    status === "active" ? (
      <span className="admin-badge admin-badge--ok">Signed in</span>
    ) : (
      <span className="admin-badge admin-badge--info">Invited</span>
    );

  const resend = (
    <ConfirmButton
      label="Resend link"
      className="admin-btn admin-btn--sm"
      title="Resend the sign-in link?"
      body="Emails this person a fresh sign-in link."
      confirmLabel="Send"
      onConfirm={() => run(resendPortalInvite)}
      onDone={() => router.refresh()}
    />
  );

  // Compact list row: badge, plus a Resend affordance for the invited (not-yet
  // -signed-in) state so an admin can nudge them without opening the detail.
  if (!full) {
    return (
      <span className="u-row u-wrap">
        {badge}
        {status === "invited" && resend}
        {msg && <span className="admin-cell-muted">{msg}</span>}
      </span>
    );
  }

  return (
    <span className="u-row u-wrap">
      {badge}
      {resend}
      <ConfirmButton
        label="Revoke"
        className="admin-btn admin-btn--sm admin-btn--danger"
        title="Revoke portal access?"
        body="They are signed out and blocked until re-invited."
        confirmLabel="Revoke"
        onConfirm={() => run(revokePortalAccess)}
        onDone={() => router.refresh()}
      />
      {msg && <span className="admin-cell-muted">{msg}</span>}
    </span>
  );
}
