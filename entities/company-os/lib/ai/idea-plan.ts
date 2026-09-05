import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { companyOs } from "@/kernel/data/supabase";
import { IDEA_OFFICES } from "@/entities/company-os/lib/ideas";
import { readTextOutput } from "@/kernel/ai/response";

// Ideas Backlog generation, both kinds. Build ideas: reads the first four Ds
// of the 5D framework, asks Claude — writing as Dan Shipper — for a product
// plan and an office classification. Learnings ("What have I learned?"): a
// much lighter pass that polishes the raw story + takeaway into a short
// shareable write-up for the team feed. Both write to ai_plan on the idea row.
// Called from the /team submit actions and from admin retry — it must never
// throw. Same shape as lib/resume-screen.ts.

const MODEL = modelFor("admin-idea-plan", "standard");

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["office", "plan_markdown"],
  properties: {
    office: {
      type: "string",
      enum: [...IDEA_OFFICES],
      description:
        "Which of the Four Outcomes this idea primarily drives, mapped to its office: " +
        "increased revenue -> 'revenue'; higher-performing people (capability, performance, onboarding) -> 'talent'; " +
        "cheaper operations (time, cost, error rate of a repeating process) -> 'operations'; " +
        "valuable innovation (new capacity for work the team could not do before) -> 'innovation'. Pick exactly one.",
    },
    plan_markdown: {
      type: "string",
      description:
        "The full product plan in Markdown. Sections, in order: a one-line pitch; 'The problem' (sharpened restatement); " +
        "'Program type' (Packaged AI, Automated Workflow, or Agentic Workflow, with one sentence on why, and what simpler " +
        "type to start with if they picked too big); 'The workflow' (numbered steps from trigger to output, marking where " +
        "AI does the work and where a human stays in the loop); 'Data it needs' (what information, where it lives, what is " +
        "missing); 'FAST goal' (a Frequently discussed, Ambitious, Specific, Transparent goal with a real number and the " +
        "ROI in plain terms); 'First slice' (the smallest version worth building in week one); 'Open questions' (2-4 things " +
        "to resolve before building). Use ## headings. No preamble before the pitch line.",
    },
  },
} as const;

const PLAN_SYSTEM = `You are Dan Shipper — writer of Every, product thinker, and operator who turns half-formed ideas into products people actually build. An Edge8 employee has just submitted an AI program idea through the company's Ideas Backlog, structured around the 5D framework they are learning (Define the problem, Discover what AI needs, Design the program, Determine success, Deploy). Your job is to turn their raw answers into a product plan that is concrete enough to act on and encouraging enough that they submit their next idea too.

How to write it:
- Problem-first. Sharpen their problem statement before proposing anything. If they described a solution instead of a problem, infer the underlying problem and name it.
- Use the 5D vocabulary they are learning: program types (Packaged AI, Automated Workflow, Agentic Workflow), FAST goals (Frequently discussed, Ambitious, Specific, Transparent), and the four ROI channels (time saved, cost reduced, quality improved, speed increased).
- Recommend the SIMPLEST program type that solves the problem. Most ideas should start as Packaged AI; agentic workflows require a documented, proven workflow first. If their idea is really an agentic program, say so — and name the packaged/automated stepping stone to build first.
- Be specific with numbers. If they gave a cost or time figure, build the FAST goal around it; if they did not, propose a measurable target and mark it as an assumption to verify.
- Be direct about gaps (missing data, undocumented process) the way a good PM would — as the next thing to fix, not a reason to stop.
- Keep it tight: the whole plan should read in under three minutes. Write in second person ("you"), warm but not gushing.

Ground everything in what they actually wrote. Do not invent team details, tools, or systems they did not mention.`;

const LEARNING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["office", "summary_markdown"],
  properties: {
    office: {
      type: "string",
      enum: [...IDEA_OFFICES],
      description:
        "Which of the Four Outcomes this learning most relates to, mapped to its office: " +
        "increased revenue -> 'revenue'; higher-performing people -> 'talent'; " +
        "cheaper operations -> 'operations'; valuable innovation -> 'innovation'. Pick exactly one.",
    },
    summary_markdown: {
      type: "string",
      description:
        "The polished learning in Markdown, under 150 words total. Structure: a single bold takeaway line " +
        "(the lesson, stated so a teammate could act on it); then '## What happened' (the story, tightened); " +
        "then '## Try it yourself' (1-3 short bullets on how a teammate applies this). No preamble before the takeaway line.",
    },
  },
} as const;

const LEARNING_SYSTEM = `You are an editor for Edge8's internal "Ideas that Spark Solutions" feed. A team member has shared something they learned — per the company's Learn and Share value — as a raw story plus a takeaway. Your job is a light polish, not a rewrite: make it crisp and shareable so a teammate scanning the feed gets the lesson in seconds.

How to write it:
- Keep the submitter's first-person voice ("I noticed…", "I tried…"). It is their learning, not a corporate memo.
- Lead with the takeaway as one bold line a teammate could act on tomorrow.
- Tighten the story; keep any concrete numbers, tools, or steps they named.
- End with 1-3 practical "try it yourself" bullets grounded ONLY in what they wrote.
- Under 150 words. Do not invent details, tools, or outcomes they did not mention.`;

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function markFailed(ideaId: string, error: string): Promise<Err> {
  await companyOs
    .from("ideas")
    .update({ ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", ideaId);
  return { ok: false, error };
}

export async function generateIdeaPlan(ideaId: string): Promise<Ok | Err> {
  try {
    return await runGeneration(ideaId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-idea-plan] ${ideaId} failed:`, msg);
    return markFailed(ideaId, msg);
  }
}

async function runGeneration(ideaId: string): Promise<Ok | Err> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return markFailed(ideaId, "ANTHROPIC_API_KEY is not configured.");
  }

  const { data: idea, error: ideaErr } = await companyOs
    .from("ideas")
    .select("id, kind, title, problem, data_needed, workflow, roi, story, takeaway, people:people!person_id(full_name, preferred_name)")
    .eq("id", ideaId)
    .maybeSingle();
  if (ideaErr || !idea) return markFailed(ideaId, ideaErr?.message ?? "Idea not found.");

  type Name = { full_name: string | null; preferred_name: string | null };
  const personRaw = (idea as { people: Name | Name[] | null }).people;
  const person = Array.isArray(personRaw) ? personRaw[0] ?? null : personRaw;
  const submitter = person?.preferred_name || person?.full_name || "an Edge8 team member";

  const isLearning = idea.kind === "learning";
  const prompt = isLearning
    ? `# Learning shared by ${submitter}

## Title
${idea.title}

## What happened
${idea.story}

## The takeaway
${idea.takeaway}

Polish this into a shareable learning and classify it into one office.`
    : `# Idea submitted by ${submitter}

## Title
${idea.title}

## Define — the problem
${idea.problem}

## Discover — the data it needs
${idea.data_needed}

## Design — the workflow
${idea.workflow}

## Determine — the expected ROI
${idea.roi}

Turn this into a product plan and classify it into one office.`;

  const llm = anthropic();
  const response = await llm.messages.create({
    model: MODEL,
    max_tokens: isLearning ? 2000 : 8000,
    system: isLearning ? LEARNING_SYSTEM : PLAN_SYSTEM,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: isLearning ? LEARNING_SCHEMA : PLAN_SCHEMA },
    },
    messages: [{ role: "user", content: prompt }],
  });

  const out = readTextOutput(
    "admin-idea-plan",
    MODEL,
    response,
    "The model declined to generate a plan for this idea.",
  );
  if (!out.ok) return markFailed(ideaId, out.error);

  const parsed = JSON.parse(out.text) as {
    office: string;
    plan_markdown?: string;
    summary_markdown?: string;
  };
  const markdown = isLearning ? parsed.summary_markdown : parsed.plan_markdown;
  const office = (IDEA_OFFICES as readonly string[]).includes(parsed.office) ? parsed.office : null;
  if (!office || !markdown?.trim()) {
    return markFailed(ideaId, "Model output was missing the office or the plan.");
  }

  const { error: upErr } = await companyOs
    .from("ideas")
    .update({
      office,
      ai_plan: markdown,
      ai_model: MODEL,
      ai_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ideaId);
  if (upErr) return markFailed(ideaId, upErr.message);

  return { ok: true };
}
