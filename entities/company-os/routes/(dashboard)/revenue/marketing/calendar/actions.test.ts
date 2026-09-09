import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterisation tests for the two AI drafting actions. They existed as two
// byte-identical copies of the style-field build and the email-broadcast sync;
// these tests pin the exact update payloads, the insert rows and the
// success/failure messages so the extraction into shared helpers cannot drift.
//
// The fake Supabase client is the house one (see
// entities/portal/lib/work-request-lifecycle.test.ts): `companyOs.from(table)`
// returns a chainable builder resolving to the next scripted response for that
// table, recording every operation and payload it saw.

type Response = { data?: unknown; error?: { message: string } | null };
const scripts = new Map<string, Response[]>();
const calls: { table: string; ops: string[]; payloads: unknown[] }[] = [];

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const record = { table, ops: [] as string[], payloads: [] as unknown[] };
  calls.push(record);
  const respond = () => {
    const next = (scripts.get(table) ?? []).shift();
    return { data: next?.data ?? null, error: next?.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/admin-auth", () => ({
  requireAdmin: async () => ({ email: "admin@edge8.ai" }),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/company-os/modules/campaigns/broadcasts", () => ({
  getBroadcastStats: vi.fn(async () => null),
}));
vi.mock("@/entities/company-os/modules/campaigns/ai/brand-writer", () => ({
  writeForBrand: vi.fn(),
  fetchSourceText: vi.fn(async () => "source text"),
}));
vi.mock("@/entities/company-os/modules/campaigns/ai/brand-image", () => ({
  generateEntryImage: vi.fn(),
}));
vi.mock("@/entities/company-os/modules/campaigns/marketing-images", () => ({
  listAssetImages: vi.fn(),
  setSelectedImage: vi.fn(),
}));
vi.mock("@/entities/company-os/modules/campaigns/blog-publish", () => ({
  publishBlogAsset: vi.fn(),
  revalidateBlog: vi.fn(),
}));

const createDraftBroadcastForEntry = vi.fn(async () => "new-broadcast");
const listEntries = vi.fn(async () => ({ rows: [] as unknown[] }));
vi.mock("@/entities/company-os/modules/campaigns/marketing-calendar", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createDraftBroadcastForEntry: (...args: unknown[]) => createDraftBroadcastForEntry(...(args as [])),
    listEntries: (...args: unknown[]) => listEntries(...(args as [])),
  };
});

import { writeForBrand } from "@/entities/company-os/modules/campaigns/ai/brand-writer";
import { draftCampaignAssets, draftWithAI } from "./actions";

const only = (table: string) => calls.filter((c) => c.table === table);
/** The object handed to `.update(...)` on the nth builder for that table. */
const updatePayload = (table: string, n = 0) => {
  const record = only(table)[n];
  const idx = record.ops.indexOf("update");
  return (record.payloads[idx] as unknown[])[0];
};
const insertPayload = (table: string, n = 0) => {
  const record = only(table)[n];
  const idx = record.ops.indexOf("insert");
  return (record.payloads[idx] as unknown[])[0];
};

const blogOutput = {
  channel: "blog" as const,
  title: "Blog title",
  bodyMd: "# body",
  blogStyle: "listicle",
  seoMd: "seo",
  socialStyle: "ignored-on-blog",
  imageStyle: "photo",
  imageBriefMd: "brief",
};

const emailOutput = {
  channel: "email" as const,
  title: "Email title",
  subject: " Subject ",
  preheader: " Preheader ",
  bodyMd: "email body",
  imageStyle: "photo",
};

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
  createDraftBroadcastForEntry.mockClear();
  listEntries.mockClear();
  listEntries.mockResolvedValue({ rows: [] });
  vi.mocked(writeForBrand).mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("draftWithAI", () => {
  const entry = {
    id: "entry-1",
    title: "Entry title",
    brand_id: "brand-1",
    channel: "blog",
    publish_date: "2026-09-10",
    asset_url: null,
    posted_url: null,
    broadcast_id: null,
  };

  it("refuses an entry with no brand", async () => {
    script("marketing_content", { data: { ...entry, brand_id: null } });
    expect(await draftWithAI("entry-1")).toEqual({
      ok: false,
      error: "Set a brand on this entry first, so the writer knows the voice.",
    });
  });

  it("writes the full style-field set onto the entry for its own channel", async () => {
    script("marketing_content", { data: entry }, { data: [] }, {});
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [blogOutput] });

    expect(await draftWithAI("entry-1")).toEqual({ ok: true, entries: [] });

    // Blog keeps blog_style and seo_md and drops social_style; image fields
    // apply to every channel.
    expect(updatePayload("marketing_content", 2)).toEqual({
      copy_md: "# body",
      image_style: "photo",
      image_brief_md: "brief",
      blog_style: "listicle",
      seo_md: "seo",
    });
  });

  it("creates a child entry for a foreign channel, staggered by the derivative offset", async () => {
    script(
      "marketing_content",
      { data: entry },
      { data: [] },
      { data: { id: "child-1" } },
    );
    vi.mocked(writeForBrand).mockResolvedValue({
      ok: true,
      outputs: [{ channel: "linkedin", bodyMd: "post", socialStyle: "hot-take", imageStyle: "photo" }],
    });

    await draftWithAI("entry-1");

    expect(insertPayload("marketing_content", 2)).toEqual({
      title: "Entry title",
      brand_id: "brand-1",
      channel: "linkedin",
      status: "drafted",
      publish_date: "2026-09-11",
      parent_id: "entry-1",
      created_by: "admin@edge8.ai",
      copy_md: "post",
      image_style: "photo",
      social_style: "hot-take",
    });
  });

  it("updates a linked draft broadcast in place, trimming subject and preheader", async () => {
    script(
      "marketing_content",
      { data: { ...entry, channel: "email", broadcast_id: "bc-1" } },
      { data: [] },
      {},
    );
    script("email_campaigns", {});
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [emailOutput] });

    await draftWithAI("entry-1");

    expect(updatePayload("email_campaigns")).toEqual({
      subject: "Subject",
      preheader: "Preheader",
      body_md: "email body",
      updated_at: "2026-09-06T12:00:00.000Z",
    });
    expect(createDraftBroadcastForEntry).not.toHaveBeenCalled();
  });

  it("spawns a draft broadcast when the entry has none", async () => {
    script("marketing_content", { data: { ...entry, channel: "email" } }, { data: [] }, {});
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [emailOutput] });

    await draftWithAI("entry-1");

    expect(createDraftBroadcastForEntry).toHaveBeenCalledWith({
      entryId: "entry-1",
      name: "Entry title",
      subject: "Subject",
      preheader: "Preheader",
      bodyMd: "email body",
      brandId: "brand-1",
      publishDate: "2026-09-10",
      createdBy: "admin@edge8.ai",
    });
  });

  it("reports the channels that failed to save without aborting the run", async () => {
    script(
      "marketing_content",
      { data: entry },
      { data: [] },
      { error: { message: "boom" } },
    );
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [blogOutput] });

    expect(await draftWithAI("entry-1")).toEqual({
      ok: false,
      error: "Drafted, but these did not save: blog. Try again.",
    });
  });
});

describe("draftCampaignAssets", () => {
  const campaign = {
    id: "camp-1",
    name: "Campaign name",
    idea: "the idea",
    objective: "the objective",
    brand_id: "brand-1",
    pillar_id: "pillar-1",
    starts_on: "2026-09-10",
  };

  it("refuses a campaign with no brand or no idea", async () => {
    script("marketing_campaigns", { data: { ...campaign, brand_id: null } });
    expect(await draftCampaignAssets("camp-1")).toEqual({
      ok: false,
      error: "Set a brand on this campaign first, so the writer knows the voice and channels.",
    });

    calls.length = 0;
    scripts.clear();
    script("marketing_campaigns", { data: { ...campaign, idea: "  " } });
    expect(await draftCampaignAssets("camp-1")).toEqual({
      ok: false,
      error: "Write the campaign idea first; it is the brief the writer works from.",
    });
  });

  it("inserts a blog asset anchored on the campaign start date with the same style fields", async () => {
    script("marketing_campaigns", { data: campaign });
    script("marketing_content", { data: [] }, { data: { id: "asset-1" } });
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [blogOutput] });

    expect(await draftCampaignAssets("camp-1")).toEqual({ ok: true, channels: ["blog"] });

    expect(insertPayload("marketing_content", 1)).toEqual({
      title: "Blog title",
      brand_id: "brand-1",
      pillar_id: "pillar-1",
      campaign_id: "camp-1",
      channel: "blog",
      status: "drafted",
      publish_date: "2026-09-10",
      created_by: "admin@edge8.ai",
      copy_md: "# body",
      image_style: "photo",
      image_brief_md: "brief",
      blog_style: "listicle",
      seo_md: "seo",
    });
  });

  it("updates an existing asset in place and syncs its linked draft broadcast", async () => {
    script("marketing_campaigns", { data: campaign });
    script("marketing_content", { data: [{ id: "asset-1", channel: "email", broadcast_id: "bc-9" }] }, {});
    script("email_campaigns", {});
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [emailOutput] });

    await draftCampaignAssets("camp-1");

    expect(updatePayload("marketing_content", 1)).toEqual({
      title: "Email title",
      copy_md: "email body",
      image_style: "photo",
    });
    expect(updatePayload("email_campaigns")).toEqual({
      subject: "Subject",
      preheader: "Preheader",
      body_md: "email body",
      updated_at: "2026-09-06T12:00:00.000Z",
    });
  });

  it("spawns a draft broadcast for a new email asset, dated from the campaign start", async () => {
    script("marketing_campaigns", { data: campaign });
    script("marketing_content", { data: [] }, { data: { id: "asset-1" } });
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [emailOutput] });

    await draftCampaignAssets("camp-1");

    expect(createDraftBroadcastForEntry).toHaveBeenCalledWith({
      entryId: "asset-1",
      name: "Email title",
      subject: "Subject",
      preheader: "Preheader",
      bodyMd: "email body",
      brandId: "brand-1",
      publishDate: "2026-09-10",
      createdBy: "admin@edge8.ai",
    });
  });

  it("reports partially saved channels", async () => {
    script("marketing_campaigns", { data: campaign });
    script("marketing_content", { data: [{ id: "asset-1", channel: "blog", broadcast_id: null }] }, { error: { message: "boom" } });
    vi.mocked(writeForBrand).mockResolvedValue({ ok: true, outputs: [blogOutput] });

    expect(await draftCampaignAssets("camp-1")).toEqual({
      ok: false,
      error: "Drafted, but these did not save: blog. Try again.",
    });
  });
});
