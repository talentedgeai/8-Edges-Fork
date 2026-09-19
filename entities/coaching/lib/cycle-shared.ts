// What the daily cycle (cycle.ts) and the hourly recap drafter
// (recap-drafter.ts) share: the active-profile loader, the coach contact
// lookup and the two-channel notifier. Split out on 2026-09-16 when cycle.ts
// crossed its size allowlist; nothing here is reachable from the entity door.

import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { sendLarkDm } from "@/kernel/messaging/lark-api";
import { one } from "@/kernel/config/embedded";

// Every nudge goes out on BOTH channels: a Lark DM (where the team lives)
// and the transactional email (the delivery guarantee). Either failing never
// blocks the other.
export async function notifyBoth(input: {
  email: string | null;
  subject: string;
  html: string;
  larkText: string;
  logKind: string;
}): Promise<boolean> {
  const dm = sendLarkDm(input.email, input.larkText);
  const mail = input.email
    ? sendTransactionalEmail({
        to: input.email,
        subject: input.subject,
        html: input.html,
        logMeta: { source: "coaching-cycle", kind: input.logKind },
      })
    : Promise.resolve(false);
  const [dmOk, mailOk] = await Promise.all([dm, mail]);
  return dmOk || Boolean(mailOk);
}

type PersonEmbed = {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
};

const nameOf = (p: PersonEmbed | null): string =>
  p?.preferred_name || p?.full_name || p?.email || "-";

export type ProfileRow = {
  id: string;
  coach_id: string;
  cadence_days: number;
  next_one_on_one_on: string | null;
  paused: boolean;
  // The member's preferred weekday (0 to 6) and Saigon time for 1-1s (K.34),
  // both null until they say.
  preferred_weekday: number | null;
  preferred_time: string | null;
  memberName: string;
  memberEmail: string | null;
};

export async function loadActiveProfiles(): Promise<ProfileRow[]> {
  const { data, error: profilesError } = await companyOs
    .from("coaching_profiles")
    .select(
      "id, coach_id, cadence_days, next_one_on_one_on, one_on_ones_paused_at, preferred_weekday, preferred_time, " +
        "team_members:team_members!team_member_id(status, people:people!person_id(full_name, preferred_name, email))",
    )
    .eq("active", true)
    // coach_id is nullable, despite 20260725130000 declaring it `not null`:
    // the live column was relaxed so a profile can exist for its owner's FAST
    // goals alone (/team/goals) before anyone coaches them, which is what the
    // schema snapshot in .github/fork-overlay/supabase/01-schema.sql records.
    // No coach, no 1-1 rhythm to run, so the daily cycle skips it, and
    // ProfileRow can type coach_id as a plain string behind this filter.
    .not("coach_id", "is", null);
  if (profilesError) console.error("[team/coaching-cycle] coaching_profiles", profilesError);
  const LIVE = ["active", "pre_start", "on_leave", "notice"];
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((r) => {
      const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
      return LIVE.includes((tm?.status as string) ?? "");
    })
    .map((r) => {
      const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
      const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
      return {
        id: r.id as string,
        coach_id: r.coach_id as string,
        cadence_days: (r.cadence_days as number) ?? 14,
        next_one_on_one_on: (r.next_one_on_one_on as string | null) ?? null,
        paused: Boolean(r.one_on_ones_paused_at),
        preferred_weekday: (r.preferred_weekday as number | null) ?? null,
        preferred_time: (r.preferred_time as string | null) ?? null,
        memberName: nameOf(person),
        memberEmail: person?.email ?? null,
      };
    });
}

// Coach contacts by team_members id — forward lookup, never the self-FK embed.
export async function loadCoachContacts(ids: string[]): Promise<Map<string, { name: string; email: string | null }>> {
  const map = new Map<string, { name: string; email: string | null }>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data, error: coachError } = await companyOs
    .from("team_members")
    .select("id, people:people!person_id(full_name, preferred_name, email)")
    .in("id", unique);
  if (coachError) console.error("[team/coaching-cycle] team_members", coachError);
  for (const r of (data ?? []) as Array<{ id: string; people: PersonEmbed | PersonEmbed[] | null }>) {
    const p = one(r.people);
    map.set(r.id, { name: nameOf(p), email: p?.email ?? null });
  }
  return map;
}
