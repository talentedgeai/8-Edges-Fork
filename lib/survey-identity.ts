// Server-only: resolve the current visitor to a person for survey attribution.
// NEVER import from a client component.
//
// Anyone logged in (team member OR portal client — both hold a Supabase
// session) is matched on people.auth_user_id (cryptographic, never email).
// Admins may have no linked people row, so they fall back to an email match
// against people. Anyone else (no session, or a session we can't map) is
// external: the runner collects name + email instead.

import { createSessionClient } from "@/lib/supabase/server";
import { companyOs } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin-auth";
import { PORTAL_STATUSES } from "@/lib/team-auth";

// respondent_kind buckets:
//   team     — staff (a team_members row that grants /team access) or an admin
//   client   — a person already on file who is not staff. Every logged-in
//              portal client is a client: holding a session means they are in
//              our system, so they are identified and attributed, never "external".
//   external — someone we only know from a survey (no prior record, or a record
//              that itself originated from a survey). Never reached here, since
//              an actor always has a session; produced by classifyEmail instead.
export type RespondentKind = "team" | "client" | "external";

export type SurveyActor = {
  personId: string | null; // null only for admins without a people row
  name: string;
  email: string;
  kind: RespondentKind;
};

export async function resolveSurveyActor(): Promise<SurveyActor | null> {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) return null;

  const { data: person } = await companyOs
    .from("people")
    .select("id, full_name, first_name, preferred_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (person) {
    const { data: memberships } = await companyOs
      .from("team_members")
      .select("id")
      .eq("person_id", person.id)
      .in("status", PORTAL_STATUSES)
      .limit(1);
    return {
      personId: person.id,
      name: person.preferred_name || person.first_name || person.full_name || person.email,
      email: person.email,
      // Logged in and not staff = a portal client. They hold a session, so they
      // are on file regardless of how their record first entered the system.
      kind: (memberships ?? []).length > 0 ? "team" : "client",
    };
  }

  if (await isAdminEmail(email)) {
    const { data: byEmail } = await companyOs
      .from("people")
      .select("id, full_name")
      .eq("email", email)
      .maybeSingle();
    return { personId: byEmail?.id ?? null, name: byEmail?.full_name || email, email, kind: "team" };
  }

  return null;
}

// Classify a TYPED email (the logged-out flow, where there is no session to
// trust) into a respondent_kind. A survey link shared outside the portal — the
// common case — is filled out logged-out, so without this every known
// respondent is stamped "external" and pollutes the roll-up. Call this BEFORE
// getOrCreatePerson mints a record for a brand-new respondent, otherwise that
// fresh row would make them look "on file".
//   team     — staff or admin
//   client   — already on file through a real relationship (a people row whose
//              source is anything other than a survey)
//   external — unknown to us, or a record that itself originated from a survey
export async function classifyEmail(email: string): Promise<RespondentKind> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return "external";
  if (await isAdminEmail(normalized)) return "team";

  const { data: person } = await companyOs
    .from("people")
    .select("id, source")
    .eq("email", normalized)
    .maybeSingle();
  if (!person) return "external";

  const { data: memberships } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", person.id)
    .in("status", PORTAL_STATUSES)
    .limit(1);
  if ((memberships ?? []).length > 0) return "team";

  // A record whose only origin is a survey isn't "in our system" for this
  // purpose. Any other source means a real relationship = client.
  return person.source === "survey" ? "external" : "client";
}
