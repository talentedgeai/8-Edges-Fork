import { companyOs } from "@/kernel/data/supabase";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Characterisation test for the campaign send tick. It pins the two things this
// handler is responsible for beyond sending: the per-row status writes, and the
// summary the run reports. The fake Supabase client is the one from
// entities/portal/lib/work-request-lifecycle.test.ts — `companyOs.from(table)`
// returns a chainable builder resolving to the next scripted response for that
// table, and records the operations and payloads it saw.

type Response = { data?: unknown; error?: { message: string } | null; count?: number | null };
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
    return { data: next?.data ?? null, error: next?.error ?? null, count: next?.count ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "or", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

let rpcResponse: Response = { data: [] };

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => builderFor(table),
    rpc: () => Promise.resolve({ data: rpcResponse.data ?? null, error: rpcResponse.error ?? null }),
  },
}));

// The routine-run wrapper only records the run; the handler under test is what
// matters here, so it is called straight through.
vi.mock("@/kernel/audit/routine-runs", () => ({
  withRoutineRun: (_name: string, req: Request, handler: (r: Request) => Promise<Response>) =>
    handler(req),
}));

const sendMarketingEmail = vi.fn();
// These moved out of site and into this entity with RS-08: the blog reader and
// the marketing-email renderer are about marketing_content and broadcasts,
// which campaigns owns, and site importing them made the two mutually dependent.
vi.mock("../lib/marketing-email", () => ({
  sendMarketingEmail: (...args: unknown[]) => sendMarketingEmail(...args),
}));
vi.mock("../lib/marketing-email-blocks", () => ({
  parseBroadcastBlocks: () => ({ posts: [], cta: null, layout: "cards" }),
}));
vi.mock("../lib/marketing-email-utm", () => ({ utmCampaignFor: () => "2026-09-08-hello" }));

const checkSendGate = vi.fn();
vi.mock("@/entities/campaigns/lib/broadcasts", () => ({
  checkSendGate: (...args: unknown[]) => checkSendGate(...args),
}));
vi.mock("@/entities/campaigns/lib/broadcast-blocks", () => ({
  resolveBroadcastBlocks: async () => ({ posts: [], cta: null, layout: "cards" }),
}));

import { GET } from "./email-campaign-send";

const CAMPAIGN = {
  id: "camp-1",
  subject: "Hello",
  preheader: null,
  body_md: "# hi",
  from_email: null,
  reply_to: null,
  batch_size: 10,
  scheduled_at: null,
};

const recipientUpdates = () =>
  calls.filter((c) => c.table === "email_campaign_recipients" && c.ops.includes("update"));

function run() {
  return GET(new Request("https://example.com/api/cron/email-campaign-send/"));
}

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
  rpcResponse = { data: [] };
  sendMarketingEmail.mockReset();
  checkSendGate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("email campaign send tick", () => {
  it("marks a sent recipient and reports no write failures", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    checkSendGate.mockResolvedValue({ verdict: "send" });
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1" });
    script("email_campaign_recipients", { data: null });
    script("email_events", { data: null });

    const body = await (await run()).json();

    expect(body).toMatchObject({ campaign: "camp-1", batch: 1, sent: 1, writeFailures: 0 });
    expect(recipientUpdates()).toHaveLength(1);
    expect((recipientUpdates()[0].payloads[0] as Record<string, unknown>[])[0]).toMatchObject({
      status: "sent",
      resend_email_id: "re_1",
    });
  });

  it("counts a failed 'mark sent' write into the summary without changing the send outcome", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    checkSendGate.mockResolvedValue({ verdict: "send" });
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1" });
    script("email_campaign_recipients", { error: { message: "update timed out" } });
    script("email_events", { data: null });

    const body = await (await run()).json();

    expect(body).toMatchObject({ campaign: "camp-1", sent: 1, failed: 0, writeFailures: 1 });
  });

  it("defers a row whose gate check errored, and counts a failed deferral", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    checkSendGate.mockResolvedValue({ verdict: "error", message: "db hiccup" });
    script("email_campaign_recipients", { error: { message: "update timed out" } });

    const body = await (await run()).json();

    expect(sendMarketingEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ deferred: 1, sent: 0, writeFailures: 1 });
    expect((recipientUpdates()[0].payloads[0] as Record<string, unknown>[])[0]).toMatchObject({
      status: "pending",
      claimed_at: null,
    });
  });

  it("refuses to complete a campaign when the in-flight count fails", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [] };
    script("email_campaign_recipients", { error: { message: "count failed" } });

    const res = await run();

    expect(res.status).toBe(500);
    // The 'mark sent' update must not have been attempted.
    expect(calls.filter((c) => c.table === "email_campaigns" && c.ops.includes("update"))).toHaveLength(0);
  });

  it("completes a campaign once nothing is in flight", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [] };
    script("email_campaign_recipients", { count: 0 });
    script("email_campaigns", { data: null });

    const body = await (await run()).json();

    expect(body).toMatchObject({ campaign: "camp-1", completed: true, writeFailures: 0 });
  });
});
