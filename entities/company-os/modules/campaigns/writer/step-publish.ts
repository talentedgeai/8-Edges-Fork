import { publishBlogAsset } from "@/entities/company-os/modules/campaigns/blog-publish";
import { loadBlogAsset } from "./data";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 9: publish. The same deterministic publishBlogAsset the hub button
// calls, inside the step route's request so the blog cache revalidates.
// Reached only when the brand's auto-publish switch is on; passes when the
// post is live and its URL answered 200.
export const runPublish: StepRunner = async ({ campaign }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const r = await publishBlogAsset(loaded.data.id, WRITER_ACTOR);
  if (!r.ok) return { ok: false, error: `Publish: ${r.errors.join(" ")}` };
  if (!r.verified) return { ok: false, error: `Publish: the post was published but ${r.liveUrl} did not answer 200. ${r.warning ?? ""}`.trim() };
  return { ok: true, summary: `Published at ${r.liveUrl}.` };
};
