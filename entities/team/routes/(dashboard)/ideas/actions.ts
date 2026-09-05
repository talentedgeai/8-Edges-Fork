"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { teamInsertOwn, teamRead, teamUpdateInScope } from "@/entities/team/lib/data";
import { generateIdeaPlan } from "@/entities/company-os";

// Own-service idea submission for /team. teamInsertOwn forces
// person_id = actor.personId server-side, so an idea can only ever be
// submitted as yourself. The Claude call runs synchronously in the request —
// the employee is watching a "building your plan" state — but the idea row is
// inserted FIRST, so a generation failure never loses the submission.

type SubmitResult = { ok: true; id: string } | { ok: false; error: string };

const MAX_FIELD = 5000;
const MAX_SOURCE_URLS = 10;
const MAX_URL_LEN = 500;
const MAX_PLAN = 20000;

// Keep only well-formed http(s) links — a bad scheme here (e.g. javascript:)
// would otherwise get rendered as a clickable href on the detail page.
function cleanSourceUrls(urls: string[] | undefined): string[] | { error: string } {
  const trimmed = (urls ?? []).map((u) => u.trim()).filter(Boolean);
  if (trimmed.length > MAX_SOURCE_URLS) return { error: `Add at most ${MAX_SOURCE_URLS} source links.` };
  const cleaned: string[] = [];
  for (const u of trimmed) {
    if (u.length > MAX_URL_LEN) return { error: "One of your source links is too long." };
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return { error: `"${u}" doesn't look like a valid link.` };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: `"${u}" needs to be a regular http(s) link.` };
    }
    cleaned.push(parsed.toString());
  }
  return cleaned;
}

export async function submitIdea(input: {
  title: string;
  problem: string;
  data_needed: string;
  workflow: string;
  roi: string;
}): Promise<SubmitResult> {
  const actor = await requireTeamMember();

  const title = input.title?.trim();
  const problem = input.problem?.trim();
  const dataNeeded = input.data_needed?.trim();
  const workflow = input.workflow?.trim();
  const roi = input.roi?.trim();

  if (!title) return { ok: false, error: "Give your idea a short title." };
  if (!problem) return { ok: false, error: "Define the problem first — that's the most important D." };
  if (!dataNeeded) return { ok: false, error: "Describe the data your idea would need." };
  if (!workflow) return { ok: false, error: "Sketch the workflow at a high level." };
  if (!roi) return { ok: false, error: "Estimate the ROI — a rough number beats no number." };
  for (const v of [title, problem, dataNeeded, workflow, roi]) {
    if (v.length > MAX_FIELD) return { ok: false, error: "One of your answers is too long — keep each under 5,000 characters." };
  }

  const { data, error } = await teamInsertOwn(actor, "ideas", {
    title: title.slice(0, 200),
    problem,
    data_needed: dataNeeded,
    workflow,
    roi,
  });
  if (error || !data) return { ok: false, error: error ?? "Could not save your idea." };

  // Best effort: the idea is already safe in the backlog. If generation fails,
  // the detail page explains and an admin can retry.
  await generateIdeaPlan(data.id);

  revalidatePath("/team/ideas");
  return { ok: true, id: data.id };
}

// Owner edit of a generated plan (title + markdown body). Strictly self: the
// person scope can include reports, so ownership is re-checked against
// actor.personId, never trusted from the client or widened to the scope.
export async function updateIdeaPlan(
  id: string,
  input: { title: string; plan: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireTeamMember();

  const title = input.title?.trim();
  const plan = input.plan?.trim();
  if (!title) return { ok: false, error: "Keep a short title on the idea." };
  if (title.length > 200) return { ok: false, error: "Keep the title under 200 characters." };
  if (!plan) return { ok: false, error: "The plan can't be empty. Edit it instead of clearing it." };
  if (plan.length > MAX_PLAN) return { ok: false, error: "Keep the plan under 20,000 characters." };

  const { data } = await teamRead(actor, "ideas", "id, person_id").eq("id", id).maybeSingle();
  const owner = (data as { person_id: string } | null)?.person_id;
  if (!owner || owner !== actor.personId) return { ok: false, error: "Only the submitter can edit this plan." };

  const r = await teamUpdateInScope(actor, "ideas", id, { title: title.slice(0, 200), ai_plan: plan });
  if (!r.ok) return { ok: false, error: r.error ?? "Could not save your changes." };

  revalidatePath(`/team/ideas/${id}`);
  revalidatePath("/team/ideas");
  return { ok: true };
}

// "What have I learned?" — the light half of Ideas that Spark Solutions.
// Same ownership model as submitIdea; the Claude call is a quick editorial
// polish for the team feed, not a product plan.
export async function submitLearning(input: {
  title: string;
  story: string;
  takeaway: string;
  sourceUrls?: string[];
}): Promise<SubmitResult> {
  const actor = await requireTeamMember();

  const title = input.title?.trim();
  const story = input.story?.trim();
  const takeaway = input.takeaway?.trim();

  if (!title) return { ok: false, error: "Give your learning a short title." };
  if (!story) return { ok: false, error: "Tell what happened — two honest sentences is enough." };
  if (!takeaway) return { ok: false, error: "Name the takeaway — what should a teammate do differently?" };
  for (const v of [title, story, takeaway]) {
    if (v.length > MAX_FIELD) return { ok: false, error: "One of your answers is too long — keep each under 5,000 characters." };
  }

  const sourceUrls = cleanSourceUrls(input.sourceUrls);
  if (!Array.isArray(sourceUrls)) return { ok: false, error: sourceUrls.error };

  const { data, error } = await teamInsertOwn(actor, "ideas", {
    kind: "learning",
    title: title.slice(0, 200),
    story,
    takeaway,
    source_urls: sourceUrls.length ? sourceUrls : null,
  });
  if (error || !data) return { ok: false, error: error ?? "Could not save your learning." };

  await generateIdeaPlan(data.id);

  revalidatePath("/team/ideas");
  return { ok: true, id: data.id };
}
