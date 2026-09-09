// Characterisation tests for the team chat route's own half of the turn.
//
// The streaming loop moved to entities/assistant/lib/chat-turn.ts and is pinned
// by its own tests there. What is left here is what this route decides: the
// guard, its status codes, the SSE response headers, and the ChatTurnOptions it
// builds. The load-bearing assertion is the last one — this surface passes NO
// approval hook, which is what keeps the admin assistant's write/email path
// structurally absent here rather than merely unreachable.

import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTurnOptions } from "@/entities/assistant";

const { getTeamActor, anthropicIfConfigured, runTeamChatQuery, runChatTurn, requestReviewLinks, teamChatTools } =
  vi.hoisted(() => ({
    getTeamActor: vi.fn(),
    anthropicIfConfigured: vi.fn(),
    runTeamChatQuery: vi.fn(),
    runChatTurn: vi.fn(),
    requestReviewLinks: vi.fn(),
    teamChatTools: vi.fn(() => [{ name: "query_database" }]),
  }));

vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor }));
vi.mock("@/kernel/ai/client", () => ({ anthropicIfConfigured }));
vi.mock("@/entities/assistant", () => ({
  runChatTurn,
  runTeamChatQuery,
  teamChatTools,
  buildTeamChatPrompt: () => "SYSTEM",
}));
// The review-link tool's body lives in the team entity and reaches the database;
// the route only decides who is offered it and how its outcome is relayed.
vi.mock("@/entities/team/lib/reviews/chat-tool", () => ({ requestReviewLinks }));

import { POST } from "./route";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return POST(
    new NextRequest("https://arca-wellness.vercel.app/api/team/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function optionsFor(body: unknown): Promise<ChatTurnOptions> {
  const res = await post(body);
  await res.text();
  expect(runChatTurn).toHaveBeenCalledTimes(1);
  return runChatTurn.mock.calls[0][0] as ChatTurnOptions;
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ToolUseBlock;

describe("POST /api/team/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamActor.mockResolvedValue({
      actor: { authUserId: "auth-9", personId: "person-9", displayName: "Ana" },
    });
    anthropicIfConfigured.mockReturnValue({ messages: {} });
    runChatTurn.mockResolvedValue(undefined);
  });

  it("rejects a caller who is not a team member", async () => {
    getTeamActor.mockResolvedValue({ actor: null });
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(runChatTurn).not.toHaveBeenCalled();
  });

  it("503s when the assistant is not configured", async () => {
    anthropicIfConfigured.mockReturnValue(null);
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "The assistant is not configured (missing API key)",
    });
  });

  it("400s on an unparseable body", async () => {
    const res = await POST(
      new NextRequest("https://arca-wellness.vercel.app/api/team/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });

  it("400s on an empty messages array", async () => {
    const res = await post({ messages: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "messages is required" });
  });

  it("answers with an SSE stream and hands the loop the team member's turn", async () => {
    const res = await post({
      messages: [{ role: "user", content: "hi" }],
      displayItems: [{ kind: "user", text: "hi" }],
      conversationId: "conv-9",
    });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    await res.text();

    const opts = runChatTurn.mock.calls[0][0] as ChatTurnOptions;
    expect(opts).toMatchObject({
      system: "SYSTEM",
      usageSite: "team-chat",
      logLabel: "team chat",
      conversationId: "conv-9",
      priorItems: [{ kind: "user", text: "hi" }],
      persist: { surface: "team", authUserId: "auth-9", personId: "person-9" },
      // The team transcript has only ever stored the chip's detail.
      recordToolName: false,
    });
    expect(opts.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("passes no approval hook, so this surface has no write or email path at all", async () => {
    const opts = await optionsFor({ messages: [{ role: "user", content: "hi" }] });
    expect(opts.approval).toBeUndefined();
  });

  it("defaults a missing conversationId and displayItems", async () => {
    const opts = await optionsFor({ messages: [{ role: "user", content: "hi" }] });
    expect(opts.conversationId).toBeNull();
    expect(opts.priorItems).toEqual([]);
  });

  it("writes the SSE frames the loop sends", async () => {
    runChatTurn.mockImplementation(async (o: ChatTurnOptions) => {
      o.send({ type: "text", text: "hi" });
      o.send({ type: "done", messages: [], conversationId: "c1", title: "T" });
    });
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(await res.text()).toBe(
      'data: {"type":"text","text":"hi"}\n\n' +
        'data: {"type":"done","messages":[],"conversationId":"c1","title":"T"}\n\n',
    );
  });

  describe("tool dispatch", () => {
    it("chips and runs query_database, collapsing whitespace and capping the detail", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runTeamChatQuery.mockResolvedValue({
        ok: true,
        rows: [{ n: 1 }],
        rowCount: 1,
        truncated: false,
      });
      const chip = vi.fn();
      const out = await opts.executeTool(
        toolUse("tu1", "query_database", { sql: `select  1 ${"x".repeat(200)}` }),
        chip,
      );
      expect(runTeamChatQuery).toHaveBeenCalledWith(`select  1 ${"x".repeat(200)}`);
      expect(chip).toHaveBeenCalledWith("query_database", `select 1 ${"x".repeat(111)}`);
      expect(chip.mock.calls[0][1]).toHaveLength(120);
      expect(out).toEqual({
        content: JSON.stringify({ rows: [{ n: 1 }], rowCount: 1 }),
        isError: false,
      });
    });

    it("notes a truncated result set for the model", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runTeamChatQuery.mockResolvedValue({ ok: true, rows: [], rowCount: 0, truncated: true });
      const out = await opts.executeTool(toolUse("tu1", "query_database", { sql: "s" }), vi.fn());
      expect(JSON.parse(out.content)).toEqual({
        rows: [],
        rowCount: 0,
        note: "truncated at 200 rows",
      });
    });

    it("passes a failed query's message back as an error", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runTeamChatQuery.mockResolvedValue({ ok: false, error: "permission denied" });
      const out = await opts.executeTool(toolUse("tu1", "query_database", {}), vi.fn());
      expect(out).toEqual({ content: "permission denied", isError: true });
    });

    it("offers request_review_link only to admins, managers, and the talent director", async () => {
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(teamChatTools).toHaveBeenLastCalledWith({ canRequestReviews: false });
      vi.clearAllMocks();
      runChatTurn.mockResolvedValue(undefined);
      getTeamActor.mockResolvedValue({
        actor: { authUserId: "a", personId: "p", displayName: "Mai", email: "derek.nguyen@edge8.ai", role: "employee", isAdmin: false },
      });
      await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(teamChatTools).toHaveBeenLastCalledWith({ canRequestReviews: true });
    });

    it("treats request_review_link as unknown for a caller it was not offered to", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const out = await opts.executeTool(toolUse("tu1", "request_review_link", { subject: "x", reviewers: [] }), vi.fn());
      expect(out).toEqual({ content: "Unknown tool: request_review_link", isError: true });
      expect(requestReviewLinks).not.toHaveBeenCalled();
    });

    it("chips and runs request_review_link for a manager, relaying the outcome", async () => {
      const actor = { authUserId: "a", personId: "p", displayName: "Q", email: "derek.nguyen@edge8.ai", role: "manager", isAdmin: false };
      getTeamActor.mockResolvedValue({ actor });
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const outcome = { ok: true, links: [{ name: "L", kind: "external", link: "https://x/y", created: true }], skipped: [] };
      requestReviewLinks.mockResolvedValue(outcome);
      const chip = vi.fn();
      const out = await opts.executeTool(
        toolUse("tu1", "request_review_link", { subject: "Ngoc", reviewers: [{ name: "L", email: "l@x.com" }], send: "yes" }),
        chip,
      );
      expect(chip).toHaveBeenCalledWith("request_review_link", "review link: Ngoc");
      // `send` must be a literal true; anything else never emails.
      expect(requestReviewLinks).toHaveBeenCalledWith(actor, {
        subject: "Ngoc",
        reviewers: [{ name: "L", email: "l@x.com" }],
        send: false,
      });
      expect(out).toEqual({ content: JSON.stringify(outcome), isError: false });
    });

    it("reports every other tool, privileged names included, as unknown", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(await opts.executeTool(toolUse("tu1", "nope", {}), vi.fn())).toEqual({
        content: "Unknown tool: nope",
        isError: true,
      });
      expect(await opts.executeTool(toolUse("tu2", "execute_write", {}), vi.fn())).toEqual({
        content: "Unknown tool: execute_write",
        isError: true,
      });
    });
  });
});
