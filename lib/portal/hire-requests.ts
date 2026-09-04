// Portal "Build Your Team" request. One or more candidates land as a single
// CRM deal (first stage of the active pipeline), same handoff pattern as
// bookMeetingAndHandOff (app/admin/(dashboard)/revenue/leads/actions.ts).
// Budget = sum of each candidate's monthly-midpoint * 12, with a 10% discount
// once the team is TEAM_DISCOUNT_MIN or larger.

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { canContribute, ROLE_DENIED } from "@/lib/portal/roles";
import { notifyOps } from "@/lib/lark";
import {
  findBracket,
  HIRE_TECH_STACK,
  TEAM_DISCOUNT_MIN,
  TEAM_DISCOUNT_RATE,
} from "./hire-catalog";

type Result = { ok: true; id: string } | { ok: false; error: string };

export type TeamCandidateInput = {
  positionId: string;
  bracketId: string;
  techStack: string[];
};

const techAllowed = (t: string) => (HIRE_TECH_STACK as readonly string[]).includes(t);

export async function createTeamRequestForActor(
  actor: PortalActor,
  input: { companyId: string; candidates: TeamCandidateInput[] },
): Promise<Result> {
  if (!actor.companyScope.includes(input.companyId)) return { ok: false, error: "Not your company." };
  if (!canContribute(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  if (!input.candidates.length) return { ok: false, error: "Add at least one team member." };

  // Resolve every candidate to a real bracket and its cleaned tech stack.
  const resolved = [];
  for (let i = 0; i < input.candidates.length; i++) {
    const c = input.candidates[i];
    const found = findBracket(c.positionId, c.bracketId);
    if (!found) return { ok: false, error: `Pick a role and experience level for team member ${i + 1}.` };
    const techStack = c.techStack.filter(techAllowed);
    if (techStack.length === 0) return { ok: false, error: `Pick at least one technology for team member ${i + 1}.` };
    const monthlyMidUsd = Math.round((found.bracket.minUsd + found.bracket.maxUsd) / 2);
    resolved.push({ position: found.position, bracket: found.bracket, techStack, monthlyMidUsd });
  }

  const count = resolved.length;
  const grossAnnualUsd = resolved.reduce((sum, r) => sum + r.monthlyMidUsd * 12, 0);
  const discounted = count >= TEAM_DISCOUNT_MIN;
  const annualUsd = discounted ? Math.round(grossAnnualUsd * (1 - TEAM_DISCOUNT_RATE)) : grossAnnualUsd;

  const { data: pipeline, error: plErr } = await companyOs
    .from("pipelines")
    .select("id, pipeline_stages(id, position)")
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (plErr || !pipeline) return { ok: false, error: "Couldn't submit your request. Please try again." };

  const stages = (pipeline.pipeline_stages ?? []) as { id: string; position: number }[];
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];
  if (!firstStage) return { ok: false, error: "Couldn't submit your request. Please try again." };

  const { count: stageDealCount } = await companyOs
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", firstStage.id);

  const companyName = actor.memberships.find((m) => m.companyId === input.companyId)?.companyName ?? "client";
  const title =
    count === 1
      ? `${companyName}: ${resolved[0].position.label} (${resolved[0].bracket.label})`
      : `${companyName}: Build a team of ${count}`;

  const roster = resolved
    .map((r, i) => `${i + 1}. ${r.position.label}, ${r.bracket.label} (~$${r.monthlyMidUsd.toLocaleString()}/mo). Stack: ${r.techStack.join(", ")}`)
    .join("\n");
  const discountNote = discounted
    ? ` 10% team discount applied (gross $${grossAnnualUsd.toLocaleString()}/yr).`
    : "";
  const nextStep = `Portal Build Your Team request (${count} ${count === 1 ? "hire" : "hires"}).${discountNote}\n${roster}`;

  const { data, error } = await companyOs
    .from("deals")
    .insert({
      title,
      person_id: actor.personId,
      company_id: input.companyId,
      pipeline_id: pipeline.id,
      stage_id: firstStage.id,
      position: stageDealCount ?? 0,
      status: "open",
      source: "portal_build_team",
      currency: "usd",
      amount_cents: annualUsd * 100,
      next_step: nextStep,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't submit your request. Please try again." };

  await notifyOps(
    `👥 Build Your Team request: ${count} ${count === 1 ? "hire" : "hires"} for ${companyName}. Budget ~$${annualUsd.toLocaleString()}/yr${discounted ? " (10% team discount)" : ""}. Review: https://www.edge8.ai/admin/revenue/deals?open=${data.id}`,
  );

  return { ok: true, id: data.id };
}
