import { getBrandProfile } from "@/entities/company-os/modules/campaigns/brand-profiles";
import { loadCampaign, setWriterState } from "./data";
import { describeState, isWriterStep, nextState, WRITER_STEPS, type WriterState, type WriterStepId } from "./steps";
import { runAssemble } from "./step-assemble";
import { runChannels } from "./step-channels";
import { runPublish } from "./step-publish";
import { runDraft } from "./step-draft";
import { runEdit } from "./step-edit";
import { runExhibits } from "./step-exhibits";
import { runHero } from "./step-hero";
import { runLinks } from "./step-links";
import { runSeo } from "./step-seo";
import { runValidate } from "./step-validate";
import type { StepRunner } from "./types";

// The state machine. `advance` reads the campaign's writer_step, runs that one
// step, and writes either the next state or the error back. It never runs two
// steps: each tick of the cron (or the hub's first call) is one step, which is
// what keeps every step inside the platform's request limit and gives every
// step its own routine_runs row.

const RUNNERS: Record<WriterStepId, StepRunner> = {
  draft: runDraft,
  edit: runEdit,
  seo: runSeo,
  exhibits: runExhibits,
  hero: runHero,
  links: runLinks,
  assemble: runAssemble,
  validate: runValidate,
  publish: runPublish,
  channels: runChannels,
};

export type AdvanceResult =
  | { ok: true; campaignId: string; step: WriterStepId; next: WriterState; summary: string }
  | { ok: false; campaignId: string; step: WriterStepId; error: string }
  | { skipped: string; campaignId: string };

export async function advance(campaignId: string): Promise<AdvanceResult> {
  const loaded = await loadCampaign(campaignId);
  if (!loaded.ok) return { skipped: loaded.error, campaignId };
  const campaign = loaded.data;
  if (!isWriterStep(campaign.writerStep)) {
    return { skipped: campaign.writerStep ? describeState(campaign.writerStep as WriterState) : "No writer run on this campaign.", campaignId };
  }
  if (campaign.writerError) return { skipped: `Stopped at ${describeState(campaign.writerStep)}: ${campaign.writerError}`, campaignId };
  const step = campaign.writerStep;

  if (!campaign.brandId) {
    const error = "The campaign has no brand; the writer reads its process from the brand profile.";
    await setWriterState(campaignId, { step, error });
    return { ok: false, campaignId, step, error };
  }
  const profile = await getBrandProfile(campaign.brandId);
  if (!profile) {
    const error = "Brand not found.";
    await setWriterState(campaignId, { step, error });
    return { ok: false, campaignId, step, error };
  }

  let result: Awaited<ReturnType<StepRunner>>;
  try {
    result = await RUNNERS[step]({ campaign, profile });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!result.ok) {
    const saved = await setWriterState(campaignId, { step, error: result.error });
    if (!saved.ok) console.error("[writer] could not record the step error:", saved.error);
    return { ok: false, campaignId, step, error: result.error };
  }
  const next = nextState(step, profile.autoPublish);
  const saved = await setWriterState(campaignId, { step: next, error: null });
  if (!saved.ok) return { ok: false, campaignId, step, error: `Step passed but the state did not save: ${saved.error}` };
  return { ok: true, campaignId, step, next, summary: result.summary };
}

// Start (or restart from the top) a run: the first step is drafted next.
export async function startWriterRun(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return setWriterState(campaignId, { step: WRITER_STEPS[0].id, error: null, startedAt: new Date().toISOString() });
}
