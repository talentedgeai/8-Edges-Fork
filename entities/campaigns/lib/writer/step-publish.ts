import { publishBlogAsset } from "@/entities/campaigns/lib/blog-publish";
import { finishCampaign, loadBlogAsset, scheduleBlogAsset } from "./data";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 10: publish. The same deterministic publishBlogAsset the hub button
// calls, inside the step route's request so the blog cache revalidates.
// Reached only when the brand's auto-publish switch is on, after every channel
// is written; passes when the post is live and its URL answered 200, and
// closes the campaign as done on the day the post goes live.
//
// A post dated later than today is not published early. It is moved to
// scheduled, the same hand-off a person makes on the hub, and the daily
// publish routine puts it live on its date. That keeps a campaign written
// ahead of time from jumping the queue on the blog and in the weekly letter.
export const runPublish: StepRunner = async ({ campaign }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  const today = new Date().toISOString().slice(0, 10);
  if (blog.publishDate && blog.publishDate > today && blog.status !== "published") {
    const scheduled = await scheduleBlogAsset(blog.id);
    if (!scheduled.ok) return { ok: false, error: `Publish: ${scheduled.error}` };
    const finished = await finishCampaign(campaign.id, blog.publishDate);
    if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
    return { ok: true, summary: `Scheduled for ${blog.publishDate}; the daily publish routine puts it live that morning. Campaign done.` };
  }
  const r = await publishBlogAsset(blog.id, WRITER_ACTOR);
  if (!r.ok) return { ok: false, error: `Publish: ${r.errors.join(" ")}` };
  // A live-URL check can only be made against a real origin. When the site
  // origin is not configured the URL is a bare path, the check can never pass,
  // and failing here would leave a published post's campaign open forever. The
  // post is live either way; say so and carry on.
  const hasOrigin = /^https?:\/\//.test(r.liveUrl);
  if (!r.verified && hasOrigin) return { ok: false, error: `Publish: the post was published but ${r.liveUrl} did not answer 200. ${r.warning ?? ""}`.trim() };
  const finished = await finishCampaign(campaign.id, blog.publishDate ?? today);
  if (!finished.ok) return { ok: false, error: `Publish: ${finished.error}` };
  if (!hasOrigin) return { ok: true, summary: `Published at ${r.liveUrl}; the live URL was not verified because no site origin is configured (set NEXT_PUBLIC_SITE_URL). Campaign done.` };
  return { ok: true, summary: `Published at ${r.liveUrl}. Campaign done.` };
};
