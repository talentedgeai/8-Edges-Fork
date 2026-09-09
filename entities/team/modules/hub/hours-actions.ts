"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { setDayOverride, clearDayOverride, setPersonFocusHours, rescanAllHours, rescanPersonHours } from "@/entities/htt";

// Team portal edits to the hours ledger. An engineer may correct their own
// days and their own budget; an admin viewing the team surface may correct
// anyone's. The htt entity owns the rows and the rule.

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/team/clients", "layout");
  revalidatePath("/admin/revenue/companies", "layout");
  revalidatePath("/portal/hub");
  revalidatePath("/portal/tokens");
}

export async function teamOverrideDayHours(
  repoId: string,
  personId: string,
  day: string,
  hours: number,
  reason: string,
): Promise<Result> {
  const actor = await requireTeamMember();
  if (!actor.isAdmin && personId !== actor.personId) return { ok: false, error: "You can only edit your own days." };
  const r = await setDayOverride({ repoId, personId, day, hours, reason, actor: actor.email });
  if (r.ok) refresh();
  return r;
}

export async function teamClearDayHours(repoId: string, personId: string, day: string): Promise<Result> {
  const actor = await requireTeamMember();
  if (!actor.isAdmin && personId !== actor.personId) return { ok: false, error: "You can only edit your own days." };
  const r = await clearDayOverride({ repoId, personId, day, actor: actor.email });
  if (r.ok) refresh();
  return r;
}

export async function teamSetFocusBudget(personId: string, hours: number): Promise<Result> {
  const actor = await requireTeamMember();
  if (!actor.isAdmin && personId !== actor.personId) return { ok: false, error: "You can only edit your own budget." };
  const r = await setPersonFocusHours(personId, hours, actor.email);
  if (r.ok) refresh();
  return r;
}

// Re-run the hours rule over stored sessions. A rule change (the unattended
// taper, the daily cap) only rewrites a day when something recomputes it, and
// nothing does that on its own — the live ingest touches only the day it posts.
// An engineer may rescan their own history; an admin may rescan everyone's.
export async function teamRescanHours(personId: string | null): Promise<Result> {
  const actor = await requireTeamMember();
  if (personId === null && !actor.isAdmin) return { ok: false, error: "Only an admin can rescan everyone." };
  if (personId !== null && !actor.isAdmin && personId !== actor.personId) {
    return { ok: false, error: "You can only rescan your own days." };
  }
  try {
    if (personId === null) await rescanAllHours();
    else await rescanPersonHours(personId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Rescan failed." };
  }
  refresh();
  return { ok: true };
}
