"use server";

import { revalidatePath } from "next/cache";
import { PALETTE } from "@/kernel/config/palette";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { requireAdmin, isAdminEmail } from "@/kernel/identity/admin-auth";
import { findAuthUserByEmail, bannedUntil } from "@/kernel/identity/auth-users";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { updatePeople } from "@/kernel/identity/writes";

// Provisioning of /team portal access for a team member, moved here from
// routes/(dashboard)/talent/team/actions.ts so that InvitePortalButton — shared
// UI rendered from several admin pages — depends on its module rather than on a
// route. The rest of that route file (team-member edits, salary, reviews) stays
// where it is: only the portal actions the shared button calls moved.

type Result = { ok: true; message: string } | { ok: false; error: string };


// Ban horizon for revoked portal access. Banning (not deleting) keeps the
// people.auth_user_id link intact so access can be restored by re-inviting.
// Sessions die on the next request: every gate revalidates via getUser(), which
// the auth server refuses for a banned user.
const REVOKE_BAN = "87600h"; // ~10 years

// Load the team member + linked person a portal action targets, with the shared
// refusals: no person, no email, or an admin email (admins use /admin, never /team).
type PortalTarget = {
  teamMemberId: string;
  status: string | null;
  personId: string;
  email: string;
  authUserId: string | null;
};

async function loadPortalTarget(
  teamMemberId: string,
): Promise<{ target: PortalTarget } | { error: string }> {
  if (!teamMemberId) return { error: "Missing team member." };

  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("id, person_id, status")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (tmErr || !tm) return { error: tmErr?.message ?? "Team member not found." };

  const { data: person, error: pErr } = await companyOs
    .from("people")
    .select("id, email, auth_user_id")
    .eq("id", tm.person_id)
    .maybeSingle();
  if (pErr || !person) return { error: pErr?.message ?? "Linked person not found." };

  const email = ((person.email as string | null) ?? "").trim().toLowerCase();
  if (!email) return { error: "This person has no email address on file." };

  if (await isAdminEmail(email)) {
    return { error: "This person is an admin. Admins use /admin, not the portal." };
  }

  return {
    target: {
      teamMemberId: tm.id as string,
      status: (tm.status as string | null) ?? null,
      personId: person.id as string,
      email,
      authUserId: (person.auth_user_id as string | null) ?? null,
    },
  };
}

// Invite a team member to the /team portal: mint (or reuse) their Supabase auth
// user and link it on people.auth_user_id. Gated by requireAdmin(). Sends a real
// magic-link invite email via Supabase, so this is deliberately explicit.
// Re-inviting someone whose access was revoked lifts the ban instead.
export async function inviteToPortal(teamMemberId: string): Promise<Result> {
  const admin = await requireAdmin();
  const loaded = await loadPortalTarget(teamMemberId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  // Only portal-eligible employment statuses get an invite; anyone else would
  // receive a link that requireTeamMember() dead-ends at the login screen.
  if (!t.status || !PORTAL_STATUSES.includes(t.status)) {
    return {
      ok: false,
      error: `Status '${t.status ?? "unknown"}' is not portal-eligible (needs one of: ${PORTAL_STATUSES.join(", ")}).`,
    };
  }

  // Already linked: restore access if it was revoked, otherwise nothing to do.
  if (t.authUserId) {
    const { data, error: lookupErr } = await supabase.auth.admin.getUserById(t.authUserId);
    if (lookupErr) return { ok: false, error: `Could not read the account: ${lookupErr.message}` };
    if (data?.user && bannedUntil(data.user)) {
      const { error } = await supabase.auth.admin.updateUserById(t.authUserId, {
        ban_duration: "none",
      });
      if (error) return { ok: false, error: `Could not restore access: ${error.message}` };
      await updatePeople({ is_team_member: true }).eq("id", t.personId);
      await recordAudit({
        table: "people",
        recordId: t.personId,
        operation: "update",
        actor: admin.email,
        context: { action: "portal_restore", team_member_id: t.teamMemberId },
      });
      revalidatePath("/admin/talent/team");
      return { ok: true, message: "Portal access restored." };
    }
    return { ok: true, message: "Already has portal access." };
  }

  // Reuse an existing auth user with this exact email (e.g. created elsewhere);
  // otherwise mint one and email the invite. Either way the email matches by
  // construction, so we never link a mismatched identity.
  const existing = await findAuthUserByEmail(t.email);
  let authUserId: string;
  if (existing) {
    authUserId = existing.id;
  } else {
    // Server-side invite → implicit-flow link (session in the URL hash), which
    // /api/auth/callback can't read (it only handles PKCE ?code=). Land on the
    // client callback that reads the hash, establishes the session, and hands
    // off to /team. See app/team/(auth)/callback/page.tsx.
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(t.email, {
      redirectTo: `${getSiteOrigin()}/team/callback`,
    });
    if (error || !data?.user) return { ok: false, error: error?.message ?? "Invite failed to send." };
    authUserId = data.user.id;
  }

  const { error: upErr } = await updatePeople({ auth_user_id: authUserId, is_team_member: true })
    .eq("id", t.personId);
  if (upErr) {
    // Linking failed after (possibly) minting a user; surface it rather than
    // leaving an orphaned auth user silently.
    return { ok: false, error: `Auth user ready but linking failed: ${upErr.message}` };
  }

  await recordAudit({
    table: "people",
    recordId: t.personId,
    operation: "update",
    actor: admin.email,
    context: {
      action: "portal_invite",
      team_member_id: t.teamMemberId,
      linked_existing_auth_user: Boolean(existing),
    },
  });

  revalidatePath("/admin/talent/team");
  return {
    ok: true,
    message: existing ? "Linked existing account and enabled portal access." : "Invite sent.",
  };
}

// Email an already-provisioned member a fresh sign-in link (the original invite
// expires; this is the admin-triggered recovery path). Idempotent.
export async function resendPortalInvite(teamMemberId: string): Promise<Result> {
  const admin = await requireAdmin();
  const loaded = await loadPortalTarget(teamMemberId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  if (!t.authUserId) return { ok: false, error: "Not invited yet — use Invite instead." };

  // token_hash + /team/verify instead of the raw action_link: the raw link is
  // a one-time GET that email security scanners consume before the person
  // clicks. The verify page only redeems the token on a button press.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: t.email,
    options: { redirectTo: `${getSiteOrigin()}/team/callback` },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { ok: false, error: error?.message ?? "Could not generate a sign-in link." };
  }
  const verifyUrl = `${getSiteOrigin()}/team/verify?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;

  await sendTransactionalEmail({
    to: t.email,
    subject: "Your 8 Edges Team sign-in link",
    html: `
      <p>Here is your sign-in link for the 8 Edges Team workspace:</p>
      <p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Sign in to the 8 Edges Team workspace</a></p>
      <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a sign-in page. Press "Sign in" there and you're in. If the link expires, you can request a fresh one any time at <a href="${getSiteOrigin()}/team/login">${getSiteOrigin()}/team/login</a>.</p>
    `,
  });

  await recordAudit({
    table: "people",
    recordId: t.personId,
    operation: "update",
    actor: admin.email,
    context: { action: "portal_resend", team_member_id: t.teamMemberId },
  });

  return { ok: true, message: "Sign-in link sent." };
}

// Revoke portal access: ban the auth user (new sign-ins refused, and existing
// sessions die on the next request because every gate revalidates via
// getUser()). The people.auth_user_id link is kept so Invite can restore access.
export async function revokePortalAccess(teamMemberId: string): Promise<Result> {
  const admin = await requireAdmin();
  const loaded = await loadPortalTarget(teamMemberId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const t = loaded.target;

  if (!t.authUserId) return { ok: false, error: "No portal access to revoke." };

  const { error } = await supabase.auth.admin.updateUserById(t.authUserId, {
    ban_duration: REVOKE_BAN,
  });
  if (error) return { ok: false, error: `Revoke failed: ${error.message}` };

  await updatePeople({ is_team_member: false }).eq("id", t.personId);

  await recordAudit({
    table: "people",
    recordId: t.personId,
    operation: "update",
    actor: admin.email,
    context: { action: "portal_revoke", team_member_id: t.teamMemberId },
  });

  revalidatePath("/admin/talent/team");
  return { ok: true, message: "Portal access revoked." };
}
