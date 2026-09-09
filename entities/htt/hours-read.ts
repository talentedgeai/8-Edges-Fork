// The read side of the human hours ledger: one row per (person, day) on a repo,
// with the auto row and any override collapsed into what the ledger renders.
//
// Split from hours-ledger.ts (the writer) when the daily cap and the taper's
// evidence pushed that file past the 400-line cap. The seam is deliberate: this
// file only projects stored rows into LedgerRow and never computes the rule.
import { companyOs, htt } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import { selectAll } from "./select-all";
import type { LedgerRow } from "./ledger-types";

type EntryRow = {
  id: string;
  person_id: string | null;
  occurred_on: string;
  hours: number;
  source: string;
  status: string;
  description: string | null;
  created_by: string | null;
  measured_hours: number | null;
  evidence: Json;
  needs_review: boolean;
  updated_at: string;
};

/** Every day on a repo, one row per (person, day), newest first. */
export async function listHoursLedger(repoId: string): Promise<LedgerRow[]> {
  const { data: entries, error } = await selectAll<EntryRow>((from, to) =>
    htt
      .from("man_hour_entries")
      .select("id, person_id, occurred_on, hours, source, status, description, created_by, measured_hours, evidence, needs_review, updated_at", { count: "exact" })
      .eq("repo_id", repoId)
      .order("occurred_on", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`man_hour_entries read failed: ${error.message}`);

  const personIds = [...new Set(entries.map((e) => e.person_id).filter((p): p is string => !!p))];
  const names = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: people, error: pErr } = await companyOs.from("people").select("id, full_name").in("id", personIds);
    if (pErr) throw new Error(`people read failed: ${pErr.message}`);
    for (const p of people ?? []) names.set(p.id, p.full_name ?? "Unknown");
  }
  const repoIds = new Set<string>();
  for (const e of entries) {
    const others = (e.evidence as { others?: Record<string, number> } | null)?.others ?? {};
    for (const id of Object.keys(others)) repoIds.add(id);
  }
  const repoNames = new Map<string, string>();
  if (repoIds.size > 0) {
    const { data: repos, error: rErr } = await htt.from("repos").select("id, name, github_repo").in("id", [...repoIds]);
    if (rErr) throw new Error(`repos read failed: ${rErr.message}`);
    for (const r of repos ?? []) repoNames.set(r.id, r.github_repo?.split("/").pop() ?? r.name);
  }

  const byKey = new Map<string, { auto?: EntryRow; manual?: EntryRow }>();
  for (const e of entries) {
    const key = `${e.person_id ?? "none"}|${e.occurred_on}`;
    const slot = byKey.get(key) ?? {};
    if (e.source === "manual") {
      if (e.status !== "excluded" && (!slot.manual || e.updated_at > slot.manual.updated_at)) slot.manual = e;
    } else if (!slot.auto) slot.auto = e;
    byKey.set(key, slot);
  }

  const rows: LedgerRow[] = [];
  for (const [key, { auto, manual }] of byKey) {
    const [personId, day] = key.split("|");
    const ev = (auto?.evidence ?? null) as {
      sessions?: number;
      totalMeasured?: number;
      others?: Record<string, number>;
      budget?: number;
      scaled?: boolean;
      rule?: string;
      storedHours?: number;
      turns?: number;
      prs?: Record<string, number>;
      unattendedHours?: number;
      unattendedWeight?: number;
      unattendedCredited?: number;
      unattendedBands?: Array<{ weight: number; hours: number }>;
      attendedByActivityHours?: number;
      dayTurns?: number;
      reviewReason?: string | null;
      ceiling?: number;
      rawDayTotal?: number;
      capped?: boolean;
    } | null;
    const autoHours = auto ? Number(auto.hours) : null;
    rows.push({
      day,
      personId: personId === "none" ? null : personId,
      personName: personId === "none" ? "Unattributed" : names.get(personId) ?? "Unknown",
      measured: auto?.measured_hours != null ? Number(auto.measured_hours) : null,
      autoHours,
      final: manual ? Number(manual.hours) : auto && auto.status !== "excluded" ? autoHours ?? 0 : 0,
      overridden: !!manual,
      reason: manual?.description ?? null,
      overrideBy: manual?.created_by ?? null,
      needsReview: !!auto?.needs_review && !manual,
      scaled: !!ev?.scaled,
      sessions: ev?.sessions ?? 0,
      totalMeasured: ev?.totalMeasured ?? null,
      others: Object.entries(ev?.others ?? {}).map(([id, hours]) => ({ repo: repoNames.get(id) ?? "other repo", hours })),
      budget: ev?.budget ?? null,
      rule: ev?.rule ?? null,
      legacyCapped: ev?.rule === "legacy" && ev?.storedHours != null && ev?.budget != null && Number(ev.storedHours) > Number(ev.budget) && autoHours != null && autoHours < Number(ev.storedHours),
      turns: ev?.turns ?? null,
      prs: Object.keys(ev?.prs ?? {}),
      unattendedHours: ev?.unattendedHours ?? null,
      unattendedWeight: ev?.unattendedWeight ?? null,
      // Rows written before the taper carry no bands; fall back to the flat
      // weight they were actually billed at rather than reporting nothing.
      unattendedCredited:
        ev?.unattendedCredited ??
        (ev?.unattendedHours != null && ev?.unattendedWeight != null ? ev.unattendedHours * ev.unattendedWeight : null),
      unattendedBands: ev?.unattendedBands ?? [],
      attendedByActivityHours: ev?.attendedByActivityHours ?? null,
      dayTurns: ev?.dayTurns ?? null,
      reviewReason: ev?.reviewReason ?? null,
      ceiling: ev?.ceiling ?? null,
      rawDayTotal: ev?.rawDayTotal ?? null,
      capped: !!ev?.capped,
    });
  }
  return rows.sort((a, b) => b.day.localeCompare(a.day) || a.personName.localeCompare(b.personName));
}
