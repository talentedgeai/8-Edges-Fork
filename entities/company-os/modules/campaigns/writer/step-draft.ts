import { writeForBrand } from "@/entities/company-os/modules/campaigns/ai/brand-writer";
import { storeCampaignOutputs } from "@/entities/company-os/modules/campaigns/calendar-drafting";
import { emDashError, wordCount, wordRangeError } from "./checks";
import { activeChannelsFrom, wordRangeFrom } from "./profile-rules";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 1: the brand writer drafts every active channel from the approved idea.
// Passes when every active channel came back and the blog sits inside the
// brand's word range. Nothing is stored on a failed check, so a retry drafts
// again rather than editing a short post into shape.
export const runDraft: StepRunner = async ({ campaign, profile }) => {
  if (!campaign.brandId) return { ok: false, error: "Set a brand on this campaign first, so the writer knows the voice and channels." };
  if (!campaign.idea?.trim()) return { ok: false, error: "Write the campaign idea first; it is the brief the writer works from." };
  const range = wordRangeFrom(profile);
  if (!range) return { ok: false, error: "The brand profile states no blog word range (for example \"1500 to 2500 words\"). Add it under Marketing > Brands." };

  const result = await writeForBrand({
    brandId: campaign.brandId,
    sourceText: campaign.idea,
    brief: campaign.objective || campaign.name,
  });
  if (!result.ok) return result;

  const wanted = activeChannelsFrom(profile);
  const got = new Set(result.outputs.map((o) => o.channel));
  const missing = wanted.filter((c) => !got.has(c));
  if (missing.length) return { ok: false, error: `The writer returned no ${missing.join(", ")} deliverable; the brand's channel rules ask for it.` };

  const blog = result.outputs.find((o) => o.channel === "blog")!;
  const tooLong = wordRangeError(blog.bodyMd, range);
  if (tooLong) return { ok: false, error: `Draft: ${tooLong}` };
  const dash = emDashError(blog.bodyMd);
  if (dash) return { ok: false, error: `Draft: ${dash}` };

  const { failed } = await storeCampaignOutputs({
    campaign: { id: campaign.id, name: campaign.name, brandId: campaign.brandId, pillarId: campaign.pillarId, startsOn: campaign.startsOn },
    outputs: result.outputs,
    actor: WRITER_ACTOR,
  });
  if (failed.length) return { ok: false, error: `Drafted, but could not save ${failed.join(", ")}.` };

  return { ok: true, summary: `Drafted ${result.outputs.map((o) => o.channel).join(", ")}; blog ${wordCount(blog.bodyMd)} words.` };
};
