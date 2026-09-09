import { beforeEach, describe, expect, it, vi } from "vitest";
import * as F from "./fixtures/pipeline";

// The pipeline end to end against recorded model output: a fixture campaign
// runs steps 1 to 8 through advance(), one call per step, and every check in
// the process table has a test that proves it blocks. The data layer is an
// in-memory store standing in for ./data; the model is a fake whose reply is
// chosen by the task each step's system prompt names, read through the real
// readTextOutput so usage accounting runs too.

type Campaign = {
  id: string; name: string; idea: string | null; objective: string | null; brandId: string | null; pillarId: string | null;
  startsOn: string | null; writerStep: string | null; writerStartedAt: string | null; writerError: string | null;
};
type Blog = { id: string; title: string; copyMd: string | null; seoMd: string | null; imageUrl: string | null; imageBriefMd: string | null; notes: string | null; status: string; postedUrl: string | null };
type Asset = { id: string; channel: string; status: string; imageUrl: string | null };

const store: { campaign: Campaign; blog: Blog | null; assets: Asset[]; takenSlugs: Set<string>; heroSelects: boolean; channelImages: boolean } = {
  campaign: null as unknown as Campaign,
  blog: null,
  assets: [],
  takenSlugs: new Set(),
  heroSelects: true,
  channelImages: true,
};

// blog-publish (reached through the validate step) builds the service-role
// client at import; Node 20 in CI refuses that without native WebSocket, and
// nothing here should touch a database anyway.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.mock("./data", () => ({
  loadCampaign: async () => ({ ok: true, data: { ...store.campaign } }),
  setWriterState: async (_id: string, s: { step: string | null; error: string | null; startedAt?: string | null }) => {
    store.campaign.writerStep = s.step;
    store.campaign.writerError = s.error;
    if (s.startedAt !== undefined) store.campaign.writerStartedAt = s.startedAt;
    return { ok: true };
  },
  loadBlogAsset: async () => (store.blog ? { ok: true, data: { ...store.blog } } : { ok: false, error: "The campaign has no blog asset yet." }),
  updateBlogAsset: async (_id: string, fields: Record<string, string>) => {
    if (!store.blog) return { ok: false, error: "no blog" };
    if ("copy_md" in fields) store.blog.copyMd = fields.copy_md;
    if ("seo_md" in fields) store.blog.seoMd = fields.seo_md;
    if ("notes" in fields) store.blog.notes = fields.notes;
    if ("title" in fields) store.blog.title = fields.title;
    return { ok: true };
  },
  appendBlogNotes: async (_b: Blog, heading: string, lines: string[]) => {
    store.blog!.notes = `${store.blog!.notes ?? ""}\n## ${heading}\n${lines.map((l) => `- ${l}`).join("\n")}`;
    return { ok: true };
  },
  slugTaken: async (slug: string) => store.takenSlugs.has(slug),
  listCampaignAssets: async () => ({ ok: true, data: store.assets.map((a) => ({ ...a })) }),
}));

vi.mock("@/entities/company-os/modules/campaigns/brand-profiles", () => ({
  getBrandProfile: async () => ({ ...F.PROFILE, ...profileOverride }),
}));
let profileOverride: Partial<Record<keyof typeof F.PROFILE, string | string[] | boolean | null>> = {};

let writerOutputs: unknown[] = F.WRITER_OUTPUTS;
vi.mock("@/entities/company-os/modules/campaigns/ai/brand-writer", () => ({
  writeForBrand: async () => ({ ok: true, outputs: writerOutputs }),
}));
vi.mock("@/entities/company-os/modules/campaigns/calendar-drafting", () => ({
  storeCampaignOutputs: async ({ outputs }: { outputs: typeof F.WRITER_OUTPUTS }) => {
    storedOutputs.push(outputs.map((o) => o.channel));
    const blog = outputs.find((o) => o.channel === "blog");
    if (blog) store.blog = { id: "blog-1", title: blog.title!, copyMd: blog.bodyMd, seoMd: blog.seoMd ?? null, imageUrl: null, imageBriefMd: blog.imageBriefMd ?? null, notes: null, status: "drafted", postedUrl: null };
    for (const o of outputs) {
      if (!store.assets.some((a) => a.channel === o.channel)) store.assets.push({ id: `${o.channel}-1`, channel: o.channel, status: "drafted", imageUrl: null });
    }
    return { failed: [] };
  },
}));
vi.mock("@/entities/company-os/modules/campaigns/ai/brand-image", () => ({
  HERO_ASPECT_RATIO: "16:9",
  generateEntryImage: async (id: string, opts: { aspectRatio?: string }) => {
    if (id === "blog-1") {
      heroCalls.push(opts.aspectRatio ?? "default");
      const url = "https://cdn.test/marketing/entries/blog-1/hero.png";
      if (store.heroSelects) store.blog!.imageUrl = url;
      return { ok: true, url };
    }
    const asset = store.assets.find((a) => a.id === id);
    if (asset && store.channelImages) asset.imageUrl = `https://cdn.test/marketing/entries/${id}/image.png`;
    return { ok: true, url: `https://cdn.test/marketing/entries/${id}/image.png` };
  },
}));
const heroCalls: string[] = [];
const storedOutputs: string[][] = [];
const uploads: string[] = [];
vi.mock("@/entities/company-os/modules/campaigns/exhibits", () => ({
  uploadExhibit: async (_id: string, svg: string) => {
    uploads.push(svg);
    return { ok: true, url: `https://cdn.test/marketing/entries/blog-1/exhibits/${uploads.length}.png`, width: 1600, height: 900 };
  },
}));
// The site door is mocked whole: importing the real barrel builds a Supabase
// client, which Node 20 (CI) refuses without native WebSocket. The renderer is
// the site's own pipeline spelled out against the real POST_HTML_SCHEMA, so the
// assemble step's "sanitizer keeps every block" check runs against the real
// allow-list.
vi.mock("@/entities/site", async () => {
  const posts = (await import("./fixtures/pipeline")).POSTS;
  const [{ remark }, { toHast }, { raw }, { sanitize }, { toHtml }, { POST_HTML_SCHEMA }] = await Promise.all([
    import("remark"),
    import("mdast-util-to-hast"),
    import("hast-util-raw"),
    import("hast-util-sanitize"),
    import("hast-util-to-html"),
    import("@/kernel/config/post-html-schema"),
  ]);
  return {
    getAllPublishedPosts: async () => posts,
    renderPostMarkdown: async (md: string) => toHtml(sanitize(raw(toHast(remark().parse(md), { allowDangerousHtml: true })), POST_HTML_SCHEMA)),
  };
});

// The fake model: pick the reply by the task the system prompt names.
const replies: Record<string, () => unknown> = {};
const modelCalls: string[] = [];
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({
    messages: {
      create: async (req: { system: string }) => {
        const key = Object.keys(replies).find((k) => req.system.includes(k))!;
        modelCalls.push(key);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(replies[key]()) }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        };
      },
    },
  }),
}));

const publishBlogAsset = vi.fn();
vi.mock("@/entities/company-os/modules/campaigns/blog-publish", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, publishBlogAsset: (id: string, actor: string) => publishBlogAsset(id, actor) };
});

const { advance, startWriterRun } = await import("./advance");

function resetReplies() {
  replies["You are the editor"] = () => F.EDIT_REPLY;
  replies["search and AI-search package"] = () => F.SEO_REPLY;
  replies["Propose two or three exhibits"] = () => F.EXHIBITS_REPLY;
  replies["Choose two to four published posts"] = () => F.LINKS_REPLY;
  replies["Two things for the post"] = () => F.ASSEMBLE_REPLY;
  replies["The blog post below is final and live"] = () => F.CHANNELS_REPLY;
}

beforeEach(() => {
  store.campaign = {
    id: "camp-1", name: "The Smarter the Model", idea: F.IDEA, objective: "Ship the post", brandId: "brand-1", pillarId: null,
    startsOn: "2026-09-08", writerStep: null, writerStartedAt: null, writerError: null,
  };
  store.blog = null;
  store.assets = [];
  store.takenSlugs = new Set();
  store.heroSelects = true;
  store.channelImages = true;
  storedOutputs.length = 0;
  publishBlogAsset.mockReset();
  publishBlogAsset.mockImplementation(async () => {
    store.blog!.postedUrl = "https://www.edge8.ai/post/how-to-delegate-work-to-ai/";
    store.blog!.status = "published";
    return { ok: true, slug: "how-to-delegate-work-to-ai", liveUrl: "https://www.edge8.ai/post/how-to-delegate-work-to-ai/", verified: true };
  });
  profileOverride = {};
  writerOutputs = F.WRITER_OUTPUTS;
  heroCalls.length = 0;
  uploads.length = 0;
  modelCalls.length = 0;
  resetReplies();
});

async function runUntil(step: string) {
  await startWriterRun("camp-1");
  while (store.campaign.writerStep !== step && store.campaign.writerStep !== "ready" && store.campaign.writerStep !== "done" && !store.campaign.writerError) {
    await advance("camp-1");
  }
}

describe("the pipeline end to end", () => {
  it("takes a fixture campaign from idea to ready to publish in eight steps", async () => {
    await startWriterRun("camp-1");
    expect(store.campaign.writerStep).toBe("draft");
    expect(store.campaign.writerStartedAt).not.toBeNull();

    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await advance("camp-1");
      expect(r).toMatchObject({ ok: true });
      if ("step" in r) seen.push(r.step);
    }
    expect(seen).toEqual(["draft", "edit", "seo", "exhibits", "hero", "links", "assemble", "validate"]);
    expect(store.campaign.writerStep).toBe("ready");
    expect(store.campaign.writerError).toBeNull();
    expect(modelCalls).toEqual(["You are the editor", "search and AI-search package", "Propose two or three exhibits", "Choose two to four published posts", "Two things for the post"]);

    const md = store.blog!.copyMd!;
    expect(md.match(/class="idea-in-brief"/g)).toHaveLength(1);
    expect(md.match(/class="post-figure"/g)).toHaveLength(2);
    expect(md.match(/class="faq-item"/g)).toHaveLength(5);
    expect(md).toContain("> When you have enough information to act, act.");
    expect(md).not.toContain("paraphrased");
    expect(md).toContain("[planning system](/post/three-levels-of-model-usage/)");
    expect(md).toContain(`<a href="https://every.to/vibe-check/fable-5-1" target="_blank" rel="noopener">Every's review</a>`);
    expect(md).not.toContain("—");
    expect(store.blog!.seoMd).toContain("**Title tag:** How to Delegate Work to AI");
    expect(store.blog!.seoMd).toContain("**Slug:** how-to-delegate-work-to-ai");
    expect(store.blog!.imageUrl).toMatch(/hero\.png$/);
    expect(heroCalls).toEqual(["16:9"]);
    expect(uploads).toHaveLength(2);
    expect(store.blog!.notes).toContain("## Edit pass");
    expect(store.blog!.notes).toContain("Renamed the Other 50% heading");

    // Idle afterwards: a tick on a ready campaign does nothing.
    expect(await advance("camp-1")).toMatchObject({ skipped: "Ready to publish" });
  });

  it("does nothing on a campaign without a run, and on one that stopped with an error", async () => {
    expect(await advance("camp-1")).toMatchObject({ skipped: "No writer run on this campaign." });
    store.campaign.writerStep = "edit";
    store.campaign.writerError = "boom";
    expect(await advance("camp-1")).toMatchObject({ skipped: expect.stringContaining("Stopped at Step 2 of 10: Edit: boom") });
    expect(modelCalls).toEqual([]);
  });
});

describe("with auto-publish on", () => {
  it("publishes after validate and re-derives the channels from the published post, then is done", async () => {
    profileOverride = { autoPublish: true };
    await startWriterRun("camp-1");
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await advance("camp-1");
      expect(r).toMatchObject({ ok: true });
      if ("step" in r) seen.push(r.step);
    }
    expect(seen).toEqual(["draft", "edit", "seo", "exhibits", "hero", "links", "assemble", "validate", "publish", "channels"]);
    expect(store.campaign.writerStep).toBe("done");
    expect(publishBlogAsset).toHaveBeenCalledWith("blog-1", "writer-agent");
    // The channel pass stores exactly the non-blog channels, after the publish.
    expect(storedOutputs.at(-1)).toEqual(["linkedin", "facebook", "email"]);
    for (const c of ["linkedin", "facebook", "email"]) expect(store.assets.find((a) => a.channel === c)?.imageUrl).toMatch(/image\.png$/);
    expect(await advance("camp-1")).toMatchObject({ skipped: "Published" });
  });
  it("publish: the publish gate's errors stop the run", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    publishBlogAsset.mockResolvedValue({ ok: false, errors: ["Slug \"x\" is already in use by another post."] });
    await expectBlocked("publish", /Publish: Slug "x" is already in use/);
  });
  it("publish: a live URL that does not answer 200 stops the run", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("publish");
    publishBlogAsset.mockResolvedValue({ ok: true, slug: "s", liveUrl: "https://www.edge8.ai/post/s/", verified: false, warning: "Not yet." });
    await expectBlocked("publish", /did not answer 200/);
  });
  it("channels: a missing channel or a channel without an image stops the run", async () => {
    profileOverride = { autoPublish: true };
    await runUntil("channels");
    replies["The blog post below is final and live"] = () => ({ outputs: F.CHANNELS_REPLY.outputs.filter((o) => o.channel !== "email") });
    await expectBlocked("channels", /no email deliverable/);
    store.campaign.writerError = null;
    replies["The blog post below is final and live"] = () => F.CHANNELS_REPLY;
    store.channelImages = false;
    await expectBlocked("channels", /still have no image/);
  });
});

async function expectBlocked(step: string, pattern: RegExp) {
  const r = await advance("camp-1");
  expect(r).toMatchObject({ ok: false, step, error: expect.stringMatching(pattern) });
  expect(store.campaign.writerStep).toBe(step);
  expect(store.campaign.writerError).toMatch(pattern);
}

describe("every check blocks", () => {
  it("draft: a missing active channel", async () => {
    writerOutputs = F.WRITER_OUTPUTS.filter((o) => o.channel !== "email");
    await startWriterRun("camp-1");
    await expectBlocked("draft", /no email deliverable/);
    expect(store.blog).toBeNull();
  });
  it("draft: a blog outside the brand's word range", async () => {
    writerOutputs = F.WRITER_OUTPUTS.map((o) => (o.channel === "blog" ? { ...o, bodyMd: "Too short." } : o));
    await startWriterRun("camp-1");
    await expectBlocked("draft", /2 words; the brand profile asks for 600 to 1200/);
  });
  it("draft: a profile with no word range says what to add", async () => {
    profileOverride = { channelsMd: "## Blog\nWrite well.", processMd: null };
    await startWriterRun("camp-1");
    await expectBlocked("draft", /states no blog word range/);
  });
  it("edit: an em dash, banned language, the brand name, or an empty change log", async () => {
    await runUntil("edit");
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY.replace("90-day plan", "90-day plan — every time"), change_log: ["x"] });
    await expectBlocked("edit", /em dash/);
    store.campaign.writerError = null;
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY.replace("90-day plan", "staffing audit plan"), change_log: ["x"] });
    await expectBlocked("edit", /audit, staffing/);
    store.campaign.writerError = null;
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY.replace("PR agency", "EDGE8 agency"), change_log: ["x"] });
    await expectBlocked("edit", /"Edge8" exactly/);
    store.campaign.writerError = null;
    replies["You are the editor"] = () => ({ body_md: F.EDITED_BODY, change_log: [] });
    await expectBlocked("edit", /no change log/);
    expect(store.blog!.copyMd).toBe(F.DRAFT_BODY);
  });
  it("seo: a bad slug, a taken slug, or a first FAQ question that is not How/What with the keyword", async () => {
    await runUntil("seo");
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, slug: "" });
    await expectBlocked("seo", /not a valid kebab-case slug/);
    store.campaign.writerError = null;
    store.takenSlugs.add("how-to-delegate-work-to-ai");
    replies["search and AI-search package"] = () => F.SEO_REPLY;
    await expectBlocked("seo", /already in use/);
    store.takenSlugs.clear();
    store.campaign.writerError = null;
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [{ question: "Why bother?", answer: "a" }, ...F.SEO_REPLY.faq.slice(1)] });
    await expectBlocked("seo", /must start with How or What/);
    store.campaign.writerError = null;
    replies["search and AI-search package"] = () => ({ ...F.SEO_REPLY, faq: [{ question: "How to write a brief?", answer: "a" }, ...F.SEO_REPLY.faq.slice(1)] });
    await expectBlocked("seo", /carry the primary keyword/);
    expect(store.blog!.seoMd).toBe("**Title tag (58 chars):** wrong label");
  });
  it("exhibits: a number the body never states, a missing heading, or fewer than two figures", async () => {
    await runUntil("exhibits");
    const [a, b] = F.EXHIBITS_REPLY.exhibits;
    replies["Propose two or three exhibits"] = () => ({ exhibits: [{ ...a, svg: a.svg.replace("42%", "99%") }, b] });
    await expectBlocked("exhibits", /Exhibit 1 shows 99, which the body never states/);
    store.campaign.writerError = null;
    replies["Propose two or three exhibits"] = () => ({ exhibits: [a, { ...b, anchor_heading: "No such heading" }] });
    await expectBlocked("exhibits", /names a heading that is not in the body/);
    store.campaign.writerError = null;
    replies["Propose two or three exhibits"] = () => ({ exhibits: [a] });
    await expectBlocked("exhibits", /fewer than two figures/);
    expect(store.blog!.copyMd).not.toContain("post-figure");
  });
  it("hero: an image that is not the entry's selected image", async () => {
    await runUntil("hero");
    store.heroSelects = false;
    await expectBlocked("hero", /not the entry's selected image/);
  });
  it("links: fewer than two placeable internal links", async () => {
    await runUntil("links");
    replies["Choose two to four published posts"] = () => ({ internal: [{ phrase: "planning system", slug: "three-levels-of-model-usage" }, { phrase: "nowhere", slug: "your-prompts-are-expiring" }], sources: [] });
    await expectBlocked("links", /only 1 internal link/);
  });
  it("links: a link to an audit page", async () => {
    store.campaign.idea = `${F.IDEA}\nAlso https://www.edge8.ai/ai-audit/`;
    await runUntil("links");
    replies["Choose two to four published posts"] = () => ({ ...F.LINKS_REPLY, sources: [{ phrase: "Every's review", url: "https://www.edge8.ai/ai-audit/" }] });
    await expectBlocked("links", /audit page/);
  });
  it("assemble: no pull quote verbatim in the idea, or an SEO package without five FAQ", async () => {
    await runUntil("assemble");
    replies["Two things for the post"] = () => ({ ...F.ASSEMBLE_REPLY, pull_quotes: [{ quote: "Not in the idea.", anchor_heading: "Budget" }] });
    await expectBlocked("assemble", /no pull quote could be verified verbatim/);
    store.campaign.writerError = null;
    store.blog!.seoMd = "**Title tag:** t\n**Meta description:** m\n**Slug:** s";
    await expectBlocked("assemble", /carries 0 FAQ item/);
  });
  it("validate: lists every failure of the assembled body at once", async () => {
    await runUntil("validate");
    store.blog!.copyMd = store.blog!.copyMd!.replace(/<figure class="post-figure">[\s\S]*?<\/figure>\n?/g, "").replace("90-day plan", "90-day — plan");
    store.blog!.imageUrl = null;
    await expectBlocked("validate", /no hero image/);
    expect(store.campaign.writerError).toMatch(/em dash/);
    expect(store.campaign.writerError).toMatch(/0 exhibit/);
  });
});
