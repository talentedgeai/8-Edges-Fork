"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { setDayOverride, clearDayOverride, setPersonFocusHours, rescanAllHours, rescanPersonHours } from "@/entities/htt";

// Admin edits to the hours ledger on an AI Program (plan:
// /workflows/private/e8/human-hours-plan.html). The htt entity owns the rows
// and the rule; these wrappers add the admin guard and cache invalidation.

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/revenue/companies", "layout");
  revalidatePath("/team/clients", "layout");
  revalidatePath("/portal/hub");
  revalidatePath("/portal/tokens");
}

export async function adminOverrideDayHours(
  repoId: string,
  personId: string,
  day: string,
  hours: number,
  reason: string,
): Promise<Result> {
  const admin = await requireAdmin();
  const r = await setDayOverride({ repoId, personId, day, hours, reason, actor: admin.email });
  if (r.ok) refresh();
  return r;
}

export async function adminClearDayHours(repoId: string, personId: string, day: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await clearDayOverride({ repoId, personId, day, actor: admin.email });
  if (r.ok) refresh();
  return r;
}

export async function adminSetFocusBudget(personId: string, hours: number): Promise<Result> {
  const admin = await requireAdmin();
  const r = await setPersonFocusHours(personId, hours, admin.email);
  if (r.ok) refresh();
  return r;
}

// Re-run the hours rule over stored sessions. A rule change (the unattended
// taper, the daily cap) only rewrites a day when something recomputes it, and
// the live ingest touches only the day it posts. Null person = everyone.
export async function adminRescanHours(personId: string | null): Promise<Result> {
  await requireAdmin();
  try {
    if (personId === null) await rescanAllHours();
    else await rescanPersonHours(personId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Rescan failed." };
  }
  refresh();
  return { ok: true };
}
