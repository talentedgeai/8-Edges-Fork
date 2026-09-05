// New Member Onboarding processor. Runs after a survey whose purpose is
// 'onboarding' is submitted (see app/api/surveys/[slug]/route.ts). It reads each
// answer's field.config.maps_to and writes it into the CRM: identity + non-
// sensitive fields on `people`, restricted PII on `people_sensitive`, uploaded
// ID/selfie object paths onto the sensitive image columns. It then moves the
// person into pre-boarding on `team_members` and, for someone who came through
// the hiring pipeline, sends the /team portal invite. A direct hire with no
// application on file is created all the same, and operations is notified to
// backfill the hiring-side record.
//
// Everything here is best-effort: the survey response + answers are already the
// authoritative record, so a downstream failure is logged, never thrown back to
// the new member mid-submit.

import { PALETTE } from "@/kernel/config/palette";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { recordAudit } from "@/kernel/audit/audit";
import { promoteSelfieToAvatar } from "@/entities/retreats";
import { ensureJourney } from "@/entities/team/modules/onboarding/cycle";
import { type SurveyFieldRow } from "@/entities/company-os";
import { upsertPeopleSensitiveRow } from "@/entities/company-os";
import { insertTeamMembers, updatePeople, updateTeamMembers } from "@/kernel/identity/writes";
import { findAuthUserByEmail } from "@/kernel/identity/auth-users";

const OPS_EMAIL = "mai@edge8.ai";

// Onboarding collects bank details as one free-text line, usually
// "<account> - <bank> - <branch>" (sometimes newline-separated, or just
// "<account> - <bank>"). Split it so payroll gets a clean account number and
// branch instead of everything crammed into the name. Conservative: only splits
// when it finds a plausible digit-run account, otherwise returns {} and the raw
// value is left untouched in bank_name. Exported so the backfill reuses it.
export function splitBankDetails(raw: string): {
  bank_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
} {
  const parts = raw
    .replace(/[\n\r]+/g, " - ")
    .split(/\s*[-–—]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return {};

  // The account number is the part that is essentially digits (≥6 of them).
  const isAccount = (s: string) => s.replace(/\D/g, "").length >= 6 && /^[\d\s.]+$/.test(s);
  const accIdx = parts.findIndex(isAccount);
  if (accIdx < 0) return {};

  const account = parts[accIdx].replace(/\s+/g, "");
  const rest = parts.filter((_, i) => i !== accIdx);
  const out: { bank_name?: string; bank_account_number?: string; bank_branch?: string } = {
    bank_account_number: account,
  };
  if (rest.length >= 1) out.bank_name = rest[0];
  if (rest.length >= 2) out.bank_branch = rest.slice(1).join(" - ");
  return out;
}

// GitHub logins arrive as whatever the new member typed: a bare login, an
// @-handle, or a pasted profile URL (with or without a scheme). Reduce all of
// those to the bare login, lowercased (the column is citext; lowercasing keeps
// the stored form uniform). Anything after the login segment of a URL is
// dropped, and anything that does not look like a GitHub login afterwards
// (letters, digits, hyphens, max 39 chars) is rejected as null rather than
// stored as junk. Exported for reuse by backfills.
export function normalizeGithubLogin(raw: string): string | null {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(/^(www\.)?github\.com\//i, "");
  v = v.replace(/^@/, "");
  v = v.split(/[/?#]/)[0].trim().toLowerCase();
  return /^[a-z0-9-]{1,39}$/.test(v) ? v : null;
}

type AnswerValue = string | string[] | number | boolean | null;

// A non-empty answer keyed by field id, already server-validated.
export type OnboardingInput = {
  personId: string;
  email: string;
  name: string | null;
  fields: SurveyFieldRow[];
  answers: Map<string, AnswerValue>;
};

function setDeep(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

export async function processOnboardingSubmission(input: OnboardingInput): Promise<void> {
  const { personId, email } = input;
  try {
    // 1) Bucket each mapped answer by destination.
    const peoplePatch: Record<string, string> = {};
    const metadataPatch: Record<string, unknown> = {};
    const sensitivePatch: Record<string, string> = {};

    for (const field of input.fields) {
      const target = field.config?.maps_to;
      if (!target) continue;
      const value = input.answers.get(field.id);
      if (value === undefined || value === null || value === "") continue;
      const parts = target.split(".");
      const table = parts[0];

      if (table === "people") {
        if (parts[1] === "metadata") {
          setDeep(metadataPatch, parts.slice(2), value);
        } else if (parts.length === 2) {
          peoplePatch[parts[1]] = String(value);
        }
      } else if (table === "people_sensitive" && parts.length === 2) {
        sensitivePatch[parts[1]] = String(value);
      }
    }

    // GitHub username: bucketed through the generic maps_to path above, but
    // pulled OUT of the combined people update. github_login is globally unique
    // (people_github_login_key), so a colliding value inside the combined
    // update would fail the whole write and destroy every other field; it gets
    // its own guarded update in step 2b instead. Normalize a pasted profile
    // URL / @-handle to the bare login (null when it is not a valid login).
    const githubLogin = peoplePatch.github_login
      ? normalizeGithubLogin(peoplePatch.github_login)
      : null;
    delete peoplePatch.github_login;

    // The selfie is a public profile photo, not restricted PII: pull it out of
    // the sensitive patch and promote it to the person's avatar after the writes.
    const selfiePath = sensitivePatch.id_selfie_path ?? null;
    delete sensitivePatch.id_selfie_path;

    // Bank details come in as one line; split into account number + branch so
    // payroll has clean fields rather than everything inside the bank name.
    if (sensitivePatch.bank_name && !sensitivePatch.bank_account_number) {
      const bank = splitBankDetails(sensitivePatch.bank_name);
      if (bank.bank_account_number) {
        sensitivePatch.bank_account_number = bank.bank_account_number;
        if (bank.bank_name) sensitivePatch.bank_name = bank.bank_name;
        if (bank.bank_branch) sensitivePatch.bank_branch = bank.bank_branch;
      }
    }

    // 2) Enrich `people` (getOrCreatePerson only set email/name, and never
    //    overwrites an existing person — so update explicitly). Merge metadata so
    //    we don't clobber onboarding_completed_at, fun_stuff, etc.
    const { data: existingPerson } = await companyOs
      .from("people")
      .select("metadata")
      .eq("id", personId)
      .maybeSingle();
    const mergedMetadata = {
      ...((existingPerson?.metadata as Record<string, unknown> | null) ?? {}),
      ...metadataPatch,
      onboarding_completed_at: new Date().toISOString(),
    };
    const { error: pErr } = await updatePeople({ ...peoplePatch, metadata: mergedMetadata })
      .eq("id", personId);
    if (pErr) console.error("[onboarding] people update failed:", pErr.message);

    // 2b) GitHub login, in its own update so a unique-index collision cannot
    //     take down the rest of the submission. Mirror the git_email rule:
    //     one login = one person, never steal a login someone else holds.
    if (githubLogin) {
      const { data: loginOwner } = await companyOs
        .from("people")
        .select("id")
        .eq("github_login", githubLogin)
        .neq("id", personId)
        .maybeSingle();
      if (loginOwner) {
        console.error("[onboarding] github login already mapped to another person:", githubLogin);
      } else {
        const { error: glErr } = await updatePeople({ github_login: githubLogin })
          .eq("id", personId);
        if (glErr) console.error("[onboarding] github_login update failed:", glErr.message);
      }
    }

    // 3) Restricted PII + uploaded ID/selfie paths, in one upsert. Dates are
    //    already validated YYYY-MM-DD by the survey engine.
    if (Object.keys(sensitivePatch).length > 0) {
      const { error: sErr } = await upsertPeopleSensitiveRow(
          { person_id: personId, ...sensitivePatch, updated_at: new Date().toISOString() },
          { onConflict: "person_id" },
        );
      if (sErr) console.error("[onboarding] people_sensitive upsert failed:", sErr.message);
      else
        await recordAudit({
          table: "people_sensitive",
          recordId: personId,
          operation: "update",
          actor: "new-member-onboarding",
          context: { fields_changed: Object.keys(sensitivePatch) },
        });
    }

    // 3b) Selfie -> public avatar. Best-effort; the survey answer keeps the
    //     record either way, so a storage hiccup never blocks the submission.
    if (selfiePath) {
      const ok = await promoteSelfieToAvatar(personId, selfiePath);
      if (!ok) console.error("[onboarding] selfie -> avatar failed for", personId);
    }

    // 3c) Git commit email -> company_os.person_git_emails. A child-table row,
    //     so it cannot flow through the generic maps_to applier (which only
    //     writes people / people_sensitive); the field's maps_to
    //     'person_git_emails.git_email' is ignored there by design and handled
    //     here. git_email is globally unique (one commit email = one person),
    //     so never reassign a row that already belongs to someone else.
    const gitEmailField = input.fields.find(
      (f) => f.config?.maps_to === "person_git_emails.git_email",
    );
    const rawGitEmail = gitEmailField ? input.answers.get(gitEmailField.id) : null;
    if (typeof rawGitEmail === "string" && rawGitEmail.trim()) {
      const gitEmail = rawGitEmail.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gitEmail)) {
        const { data: existingGitEmail } = await companyOs
          .from("person_git_emails")
          .select("id, person_id")
          .eq("git_email", gitEmail)
          .maybeSingle();
        if (!existingGitEmail) {
          // First email for this person becomes primary (a partial unique index
          // allows only one primary per person).
          const { data: primaryRow } = await companyOs
            .from("person_git_emails")
            .select("id")
            .eq("person_id", personId)
            .eq("is_primary", true)
            .maybeSingle();
          const { error: geErr } = await companyOs.from("person_git_emails").insert({
            person_id: personId,
            git_email: gitEmail,
            source: "intake",
            is_primary: !primaryRow,
          });
          if (geErr) console.error("[onboarding] person_git_emails insert failed:", geErr.message);
        } else if (existingGitEmail.person_id !== personId) {
          console.error("[onboarding] git email already mapped to another person:", gitEmail);
        }
      } else {
        console.error("[onboarding] git email answer is not a valid email, skipped");
      }
    }

    // 4) Did this person come through the hiring pipeline? Drives the invite +
    //    ops-notification branch.
    const { data: appRow } = await companyOs
      .from("applications")
      .select("id")
      .eq("person_id", personId)
      .limit(1)
      .maybeSingle();
    const matchedApplicant = Boolean(appRow);

    // 5) Move to pre-boarding on team_members (never demote an existing
    //    employment record; only create one or set the stage).
    const { data: existingTm } = await companyOs
      .from("team_members")
      .select("id, status")
      .eq("person_id", personId)
      .not("status", "in", "(terminated,alumni)")
      .limit(1)
      .maybeSingle();

    let cycleMemberId: string | null = null;
    if (existingTm) {
      const { error: tmErr } = await updateTeamMembers({ employment_stage: "pre_boarding" })
        .eq("id", existingTm.id);
      if (tmErr) console.error("[onboarding] team_member stage update failed:", tmErr.message);
      else cycleMemberId = existingTm.id;
    } else {
      const { data: newTm, error: tmErr } = await insertTeamMembers({ person_id: personId, status: "pre_start", employment_stage: "pre_boarding" })
        .select("id")
        .maybeSingle();
      if (tmErr) console.error("[onboarding] team_member insert failed:", tmErr.message);
      else cycleMemberId = (newTm as { id: string } | null)?.id ?? null;
    }
    // Start the onboarding-cycle journey immediately (the daily cron would
    // backfill it anyway; this puts the card on the manager's board today).
    if (cycleMemberId) await ensureJourney(cycleMemberId);
    await recordAudit({
      table: "team_members",
      recordId: personId,
      operation: existingTm ? "update" : "insert",
      actor: "new-member-onboarding",
      context: { action: "onboarding_pre_boarding", matched_applicant: matchedApplicant },
    });

    // 6) Portal invite — only for someone already in the pipeline. An open,
    //    unauthenticated form must not fire account invites at arbitrary
    //    addresses, so a direct hire with no application waits for a human.
    if (matchedApplicant) {
      await inviteToTeamPortal(personId, email);
    } else {
      await notifyOpsBackfill(personId, input.name, email);
    }
  } catch (err) {
    console.error("[onboarding] processing failed:", err);
  }
}

async function inviteToTeamPortal(personId: string, email: string): Promise<void> {
  try {
    const existing = await findAuthUserByEmail(email);
    let authUserId: string;
    if (existing) {
      authUserId = existing.id;
    } else {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${getSiteOrigin()}/team/callback`,
      });
      if (error || !data?.user) {
        console.error("[onboarding] portal invite failed:", error?.message);
        return;
      }
      authUserId = data.user.id;
    }
    const { error: linkErr } = await updatePeople({ auth_user_id: authUserId, is_team_member: true })
      .eq("id", personId);
    if (linkErr) console.error("[onboarding] auth link failed:", linkErr.message);
  } catch (err) {
    console.error("[onboarding] invite error:", err);
  }
}

async function notifyOpsBackfill(
  personId: string,
  name: string | null,
  email: string,
): Promise<void> {
  await sendTransactionalEmail({
    to: OPS_EMAIL,
    subject: `New onboarding submission — ${name ?? email}`,
    html: `
      <p>A new member completed onboarding but has <strong>no application on file</strong>, so this looks like a direct hire.</p>
      <p><strong>${name ?? "(no name)"}</strong> &lt;${email}&gt; is now in <strong>pre-boarding</strong>.</p>
      <p>Please backfill the hiring-side record (department, position, employee number) and send their portal invite from the Team admin when ready.</p>
      <p style="color:${PALETTE.greyMid};font-size:13px;">person_id: ${personId}</p>
    `,
    logMeta: { source: "onboarding" },
  });
}
