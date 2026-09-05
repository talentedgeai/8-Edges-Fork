"use server";

import { PALETTE } from "@/kernel/config/palette";
import { revalidatePath } from "next/cache";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { requireAdmin, isAdminEmail, canViewSensitive } from "@/kernel/identity/admin-auth";
import { findAuthUserByEmail, bannedUntil } from "@/kernel/identity/auth-users";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { setPersonAvatar, type AvatarResult } from "@/entities/retreats";
import { upsertPeopleSensitive, type SensitiveInput } from "@/entities/company-os/modules/crm/people-sensitive";
import { saveSalaryChange as recordSalaryChange } from "@/entities/company-os/lib/compensation";
import { openReviewCycle, reviewSurveySlug } from "@/entities/team";
import { slugify } from "@/kernel/config/slug";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { updatePeople, updateTeamMembers } from "@/kernel/identity/writes";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Admin sets a team member's photo. Bound to a personId in the page, so the
// AvatarUpload component only sends the file. Gated by requireAdmin + audited.
export async function adminSetPersonAvatar(
  personId: string,
  formData: FormData,
): Promise<AvatarResult> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file received." };
  const res = await setPersonAvatar(personId, file);
  if (res.ok) {
    await recordAudit({
      table: "people",
      recordId: personId,
      operation: "update",
      actor: admin.email,
      context: { field: "avatar_url", via: "admin" },
    });
    revalidatePath("/admin/talent/team");
  }
  return res;
}

// Admin sets the contract start date — the date the full-time labor contract
// begins, distinct from start_date (the probation/Day 1 anchor). The 45-day
// review's "extend probation 30 days" decision moves it automatically; this is
// the manual override.
// Plain <form action>, so it returns void; failures log server-side and the
// page re-renders with the stored value either way.
// Returned to the client form (useFormState) so the Save button can confirm
// success or surface a real error instead of silently swallowing it.
export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveContractStartDate(
  teamMemberId: string,
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requireAdmin();
  const raw = formData.get("contract_start_date");
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: "Enter a valid date." };
  const { error } = await updateTeamMembers({ contract_start_date: value || null })
    .eq("id", teamMemberId);
  if (error) {
    console.error("[talent] contract_start_date save failed:", error.message);
    return { ok: false, error: "Could not save. Please try again." };
  }
  await recordAudit({
    table: "team_members",
    recordId: teamMemberId,
    operation: "update",
    actor: admin.email,
    context: { field: "contract_start_date", value: value || null },
  });
  revalidatePath(`/admin/talent/team/${teamMemberId}`);
  return { ok: true };
}

// Admin edits the restricted PII record. Gated by requireAdmin AND
// canViewSensitive — PII is Dave & Mai only; a plain admin cannot write it. The
// upsert records its own audit row with the admin's email.
export async function saveSensitiveDetails(
  personId: string,
  input: SensitiveInput,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!(await canViewSensitive(admin.email))) {
    return { ok: false, error: "Not authorized." };
  }
  const res = await upsertPeopleSensitive(personId, input, admin.email);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/talent/team");
  return { ok: true, message: "Saved." };
}

// Add a salary change (Dave & Mai only). Append-only: the lib supersedes the
// current salary row and inserts a new one. Audits the CHANGE (comp_type +
// effective date) but NEVER the amount, so salaries never leak via audit_log.
export async function saveSalaryChange(
  teamMemberId: string,
  input: { salaryVnd: number; salaryUsdCents: number; effectiveFrom: string; changeReason?: string | null },
): Promise<Result> {
  const admin = await requireAdmin();
  if (!(await canViewSensitive(admin.email))) {
    return { ok: false, error: "Not authorized." };
  }
  const salaryVnd = Math.round(Number(input.salaryVnd));
  const salaryUsdCents = Math.round(Number(input.salaryUsdCents));
  if (!Number.isFinite(salaryVnd) || salaryVnd < 0 || !Number.isFinite(salaryUsdCents) || salaryUsdCents < 0) {
    return { ok: false, error: "Enter a valid salary amount." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return { ok: false, error: "Enter a valid effective date." };
  }
  const res = await recordSalaryChange(teamMemberId, {
    salaryVnd,
    salaryUsdCents,
    effectiveFrom: input.effectiveFrom,
    changeReason: input.changeReason?.trim() || null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "compensation_sensitive",
    recordId: res.id,
    operation: "insert",
    actor: admin.email,
    newData: { comp_type: "salary", effective_from: input.effectiveFrom },
    context: { via: "team_compensation" },
  });
  revalidatePath(`/admin/talent/team/${teamMemberId}`);
  return { ok: true, message: "Salary change saved." };
}

// Open a review cycle now (the "Send Review Now" button on the profile). Any
// admin may trigger it — it carries no salary/PII. Creates the self + manager
// rows via openReviewCycle, then emails the employee and their manager a link
// to their side. Idempotent per cycle label, so a double click is harmless.
const SITE_ORIGIN = "https://www.edge8.ai";
const REVIEW_TYPE_NAMES: Record<string, string> = {
  probation: "Probation review",
  midyear: "Mid-year check-in",
  renewal: "Renewal review",
  adhoc: "Performance review",
};

export async function sendReviewNow(
  teamMemberId: string,
  reviewType: "probation" | "midyear" | "renewal" | "adhoc",
): Promise<Result> {
  const admin = await requireAdmin();
  if (!["probation", "midyear", "renewal", "adhoc"].includes(reviewType))
    return { ok: false, error: "Unknown review type." };

  // Subject + manager-of-record, with the emails to notify.
  const { data: subject } = await companyOs
    .from("team_members")
    .select("id, manager_id, people!person_id(full_name, first_name, preferred_name, email)")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (!subject) return { ok: false, error: "Team member not found." };
  const subjectPerson = (Array.isArray(subject.people) ? subject.people[0] : subject.people) as {
    full_name: string | null;
    first_name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
  const subjectName =
    subjectPerson?.preferred_name || subjectPerson?.first_name || subjectPerson?.full_name || "your report";
  if (!subject.manager_id)
    return { ok: false, error: "Set a manager for this person before starting a review." };

  const { data: manager } = await companyOs
    .from("team_members")
    .select("people!person_id(email)")
    .eq("id", subject.manager_id)
    .maybeSingle();
  const managerPerson = (Array.isArray(manager?.people) ? manager?.people[0] : manager?.people) as {
    email: string | null;
  } | null;

  // One cycle per member per month per type: a stable, human-readable label.
  const monthTag = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .replace("-", "");
  const cycleLabel = `${reviewType}-${monthTag}`;

  const cycle = await openReviewCycle({
    teamMemberId,
    managerId: subject.manager_id,
    reviewType,
    cycleLabel,
  });
  if (!cycle.selfId || !cycle.managerId)
    return { ok: false, error: "Could not open the review cycle." };

  await recordAudit({
    table: "performance_reviews",
    recordId: cycle.managerId,
    operation: "insert",
    actor: admin.email,
    context: { via: "send_review_now", review_type: reviewType, cycle_label: cycleLabel },
  });

  const typeName = REVIEW_TYPE_NAMES[reviewType] ?? "Performance review";
  const selfLink = `${SITE_ORIGIN}/surveys/${reviewSurveySlug({ rater_kind: "self", review_type: reviewType })}?review=${cycle.selfId}`;
  const managerLink = `${SITE_ORIGIN}/surveys/${reviewSurveySlug({ rater_kind: "manager", review_type: reviewType })}?review=${cycle.managerId}`;

  if (subjectPerson?.email) {
    await sendTransactionalEmail({
      to: [subjectPerson.email],
      subject: `${typeName}: your self-assessment`,
      html:
        `<p>It is time for your ${typeName.toLowerCase()}.</p>` +
        `<p>Please complete your self-assessment. Your manager sees it only after they finish their own review.</p>` +
        `<p><a href="${selfLink}">Start your self-assessment</a></p>` +
        `<p>You can also find it under Reviews in the team portal.</p>`,
    });
  }
  if (managerPerson?.email) {
    await sendTransactionalEmail({
      to: [managerPerson.email],
      subject: `${typeName} to complete: ${subjectName}`,
      html:
        `<p>A ${typeName.toLowerCase()} for <strong>${subjectName}</strong> is ready.</p>` +
        `<p>Draft your review, then finalize it. ${subjectName} sees it only once finalized.</p>` +
        `<p><a href="${managerLink}">Start the review</a></p>`,
    });
  }

  revalidatePath(`/admin/talent/team/${teamMemberId}`);
  return {
    ok: true,
    message: managerPerson?.email
      ? `${typeName} sent to ${subjectName} and their manager.`
      : `${typeName} opened. No manager email on file, so no manager notification was sent.`,
  };
}

// ---------------------------------------------------------------------------
// Inline shelf edits. The roster shelf writes one field at a time via
// updateTeamMember; the fields live across three tables (people, team_members,
// positions), so this routes each key to the right table. Title/Level/"manages
// people" are attributes of the shared `positions` catalog, so a title change is
// a REPOINT of team_members.position_id (pick an existing row, or create one),
// never an in-place rename that would hit every co-holder and open requisition.

const STATUS_VALUES = ["active", "pre_start", "on_leave", "notice", "terminated", "alumni"];
const STAGE_VALUES = ["pre_boarding", "probation", "full_time", "declined_offer", "rescinded", "failed_probation"];
const TYPE_VALUES = ["full_time", "part_time", "contract", "intern", "temp", "advisor"];

// Free-text/scalar columns, split by owning table. Anything not listed is
// ignored, so a stray key from the client can never write an unexpected column.
const PEOPLE_FIELDS = new Set(["preferred_name", "email", "phone", "linkedin_url", "city", "country"]);
const TM_FIELDS = new Set([
  "status",
  "employment_stage",
  "employment_type",
  "work_location",
  "start_date",
  "contract_start_date",
  "probation_ends_on",
  "end_date",
  "termination_reason",
  "manager_id",
  "department_id",
  "position_id",
]);
const DATE_FIELDS = new Set(["start_date", "contract_start_date", "probation_ends_on", "end_date"]);

export type TeamMemberPatch = Partial<{
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  city: string | null;
  country: string | null;
  status: string | null;
  employment_stage: string | null;
  employment_type: string | null;
  work_location: string | null;
  start_date: string | null;
  contract_start_date: string | null;
  probation_ends_on: string | null;
  end_date: string | null;
  termination_reason: string | null;
  manager_id: string | null;
  department_id: string | null;
  position_id: string | null;
}>;

// Empty string means "cleared" -> null; otherwise trim. Keeps the DB free of
// blank strings so "no value" is always null.
function toNullable(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function updateTeamMember(
  teamMemberId: string,
  patch: TeamMemberPatch,
): Promise<SaveResult> {
  const admin = await requireAdmin();
  if (!teamMemberId) return { ok: false, error: "Missing team member." };

  const peoplePatch: Record<string, unknown> = {};
  const tmPatch: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(patch)) {
    const value = toNullable(raw);
    if (DATE_FIELDS.has(key) && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { ok: false, error: "Enter a valid date." };
    }
    if (key === "status" && value && !STATUS_VALUES.includes(value)) return { ok: false, error: "Unknown status." };
    if (key === "employment_stage" && value && !STAGE_VALUES.includes(value)) return { ok: false, error: "Unknown stage." };
    if (key === "employment_type" && value && !TYPE_VALUES.includes(value)) return { ok: false, error: "Unknown type." };
    if (key === "email" && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { ok: false, error: "Enter a valid email." };
    if (key === "manager_id" && value && value === teamMemberId) {
      return { ok: false, error: "A team member can't be their own manager." };
    }

    if (PEOPLE_FIELDS.has(key)) peoplePatch[key] = value;
    else if (TM_FIELDS.has(key)) tmPatch[key] = value;
  }

  if (Object.keys(tmPatch).length > 0) {
    const { error } = await updateTeamMembers(tmPatch).eq("id", teamMemberId);
    if (error) {
      console.error("[talent] team_members update failed:", error.message);
      return { ok: false, error: "Could not save. Please try again." };
    }
    await recordAudit({ table: "team_members", recordId: teamMemberId, operation: "update", actor: admin.email, newData: tmPatch });
  }

  if (Object.keys(peoplePatch).length > 0) {
    const { data: tm, error: tmErr } = await companyOs
      .from("team_members")
      .select("person_id")
      .eq("id", teamMemberId)
      .maybeSingle();
    if (tmErr || !tm?.person_id) return { ok: false, error: tmErr?.message ?? "No linked person to update." };
    peoplePatch.updated_at = new Date().toISOString();
    const { error } = await updatePeople(peoplePatch).eq("id", tm.person_id);
    if (error) {
      console.error("[talent] people update failed:", error.message);
      // Surface the most common conflict (email is unique) in plain language.
      const msg = /duplicate|unique/i.test(error.message) ? "That email is already used by another person." : "Could not save. Please try again.";
      return { ok: false, error: msg };
    }
    await recordAudit({ table: "people", recordId: tm.person_id as string, operation: "update", actor: admin.email, newData: peoplePatch });
  }

  revalidatePath("/admin/talent/team");
  revalidatePath(`/admin/talent/team/${teamMemberId}`);
  return { ok: true };
}

export type PositionResult =
  | { ok: true; position: { id: string; title: string; level: string | null; is_people_manager: boolean } }
  | { ok: false; error: string };

// Create a new catalog title and point this one person at it. The new position
// inherits department + employment type from the member so the catalog row is
// internally consistent. Used by the shelf's "New title…" path.
export async function createAndAssignPosition(
  teamMemberId: string,
  input: { title: string; level?: string | null; isPeopleManager?: boolean },
): Promise<PositionResult> {
  const admin = await requireAdmin();
  if (!teamMemberId) return { ok: false, error: "Missing team member." };
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Enter a title." };
  const level = toNullable(input.level);
  const isPeopleManager = !!input.isPeopleManager;

  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("department_id, employment_type")
    .eq("id", teamMemberId)
    .maybeSingle();
  // Abort if the id no longer resolves — otherwise we'd insert an orphan catalog
  // row with null dept/type, no-op the repoint, and falsely report success.
  if (tmErr || !tm) return { ok: false, error: tmErr?.message ?? "Team member not found." };

  // Keep slug unique within the catalog: take the kebab of the title, and if it
  // (or numbered variants) already exist, use the next free suffix.
  let slug = slugify(title) || "position";
  const { data: clashes } = await companyOs.from("positions").select("slug").ilike("slug", `${slug}%`);
  const taken = new Set(((clashes as { slug: string | null }[] | null) ?? []).map((r) => r.slug));
  if (taken.has(slug)) {
    let i = 2;
    while (taken.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  const { data: created, error: insErr } = await companyOs
    .from("positions")
    .insert({
      title,
      slug,
      level,
      is_people_manager: isPeopleManager,
      active: true,
      department_id: (tm?.department_id as string | null) ?? null,
      employment_type: (tm?.employment_type as string | null) ?? null,
    })
    .select("id, title, level, is_people_manager")
    .maybeSingle();
  if (insErr || !created) {
    console.error("[talent] position insert failed:", insErr?.message);
    return { ok: false, error: "Could not create the title." };
  }

  const { error: repErr } = await updateTeamMembers({ position_id: created.id })
    .eq("id", teamMemberId);
  if (repErr) {
    console.error("[talent] position repoint failed:", repErr.message);
    return { ok: false, error: "Title created but could not assign it." };
  }

  await recordAudit({
    table: "positions",
    recordId: created.id as string,
    operation: "insert",
    actor: admin.email,
    newData: { title, slug },
    context: { via: "team_shelf", team_member_id: teamMemberId },
  });
  await recordAudit({
    table: "team_members",
    recordId: teamMemberId,
    operation: "update",
    actor: admin.email,
    newData: { position_id: created.id },
    context: { via: "team_shelf_new_position" },
  });

  revalidatePath("/admin/talent/team");
  revalidatePath(`/admin/talent/team/${teamMemberId}`);
  return {
    ok: true,
    position: {
      id: created.id as string,
      title: created.title as string,
      level: (created.level as string | null) ?? null,
      is_people_manager: !!created.is_people_manager,
    },
  };
}

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
    const { data } = await supabase.auth.admin.getUserById(t.authUserId);
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
