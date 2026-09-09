import { resolveBroadcastBlocks } from "@/entities/company-os/modules/campaigns/broadcast-blocks";
import type { StepRunner } from "./types";

// Step 5: the posts and the button as the email will carry them. Every picked
// post must still resolve to a published post with a slug and a hero, and
// the call to action's page must answer. A post that lost its hero since the
// pick is a hole in the email, not a warning.

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return true;
    const get = await fetch(url, { method: "GET", redirect: "follow" });
    return get.ok;
  } catch {
    return false;
  }
}

export const runAssemble: StepRunner = async ({ letter }) => {
  const rendered = await resolveBroadcastBlocks(letter.blocks);
  const problems: string[] = [];
  if (rendered.posts.length !== letter.blocks.posts.length) problems.push(`${letter.blocks.posts.length - rendered.posts.length} picked post(s) no longer resolve to a published post with a slug.`);
  for (const p of rendered.posts) if (!p.imageUrl) problems.push(`"${p.title}" has no hero image.`);
  if (!rendered.cta) problems.push("No call to action.");
  else if (!(await answers(rendered.cta.url))) problems.push(`The call to action page did not answer: ${rendered.cta.url}`);
  for (const p of rendered.posts) if (!(await answers(p.url))) problems.push(`The post page did not answer: ${p.url}`);
  if (problems.length) return { ok: false, error: `Assemble: ${problems.join(" ")}` };
  return { ok: true, summary: `${rendered.posts.length} posts and the "${rendered.cta?.label}" button, all live, layout ${rendered.layout}.` };
};
