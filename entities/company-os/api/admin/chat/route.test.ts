// Characterisation tests for the admin chat route's own half of the turn.
//
// The streaming loop itself moved to entities/assistant/lib/chat-turn.ts and is
// pinned by its own tests there. What is left here is exactly what this route
// still decides: the guards and their status codes, the decision/pending check,
// the SSE response headers, and the ChatTurnOptions it builds — the tool
// dispatch, the approval hook and the persistence target. Those options are
// captured from a stubbed runChatTurn and then invoked directly, which pins the
// admin-only behaviour without re-running the shared loop.
//
// runChatTurn is stubbed rather than real because this route may only reach the
// assistant through its door, and the door is what these tests mock.

import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTurnOptions } from "@/entities/assistant";

const {
  getAdminUser,
  anthropic,
  runAdminChatQuery,
  isPrivilegedChatUser,
  performApprovedWrite,
  performApprovedEmail,
  performApprovedPortalInvite,
  runChatTurn,
} = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  anthropic: vi.fn(),
  runAdminChatQuery: vi.fn(),
  isPrivilegedChatUser: vi.fn(),
  performApprovedWrite: vi.fn(),
  performApprovedEmail: vi.fn(),
  performApprovedPortalInvite: vi.fn(),
  runChatTurn: vi.fn(),
}));

vi.mock("@/kernel/identity/admin-auth", () => ({ getAdminUser }));
vi.mock("@/kernel/ai/client", () => ({ anthropic }));
vi.mock("@/entities/assistant", () => ({
  runChatTurn,
  PRIVILEGED_TOOL_NAMES: new Set(["execute_write", "send_email", "invite_portal_member"]),
  runAdminChatQuery,
  isPrivilegedChatUser,
  performApprovedWrite,
  performApprovedEmail,
  performApprovedPortalInvite,
  adminChatTools: (args: unknown) => [{ name: "query_database", args }],
  buildAdminChatPrompt: () => "SYSTEM",
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return POST(
    new NextRequest("https://www.edge8.ai/api/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Drain the route's SSE body so the stream closes, then return the options. */
async function optionsFor(body: unknown): Promise<ChatTurnOptions> {
  const res = await post(body);
  await res.text();
  expect(runChatTurn).toHaveBeenCalledTimes(1);
  return runChatTurn.mock.calls[0][0] as ChatTurnOptions;
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ToolUseBlock;

describe("POST /api/admin/chat", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.clearAllMocks();
    getAdminUser.mockResolvedValue({ id: "auth-1", email: "admin@edge8.ai" });
    isPrivilegedChatUser.mockReturnValue(false);
    anthropic.mockReturnValue({ messages: {} });
    runChatTurn.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated caller", async () => {
    getAdminUser.mockResolvedValue(null);
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(runChatTurn).not.toHaveBeenCalled();
  });

  it("503s when the API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(503);
  });

  it("400s on an unparseable body", async () => {
    const res = await POST(
      new NextRequest("https://www.edge8.ai/api/admin/chat", {
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

  it("answers with an SSE stream and hands the loop the admin's turn", async () => {
    const res = await post({
      messages: [{ role: "user", content: "hi" }],
      displayItems: [{ kind: "user", text: "hi" }],
      conversationId: "conv-3",
    });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    await res.text();

    const opts = runChatTurn.mock.calls[0][0] as ChatTurnOptions;
    expect(opts).toMatchObject({
      system: "SYSTEM",
      usageSite: "admin-chat",
      logLabel: "admin chat",
      conversationId: "conv-3",
      priorItems: [{ kind: "user", text: "hi" }],
      persist: { surface: "admin", authUserId: "auth-1", personId: null },
      // The admin history panel picks a chip label from the tool name.
      recordToolName: true,
    });
    expect(opts.messages).toEqual([{ role: "user", content: "hi" }]);
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
      runAdminChatQuery.mockResolvedValue({
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
      expect(runAdminChatQuery).toHaveBeenCalledWith(`select  1 ${"x".repeat(200)}`);
      expect(chip).toHaveBeenCalledWith("query_database", `select 1 ${"x".repeat(111)}`);
      expect(chip.mock.calls[0][1]).toHaveLength(120);
      expect(out).toEqual({
        content: JSON.stringify({ rows: [{ n: 1 }], rowCount: 1 }),
        isError: false,
      });
    });

    it("notes a truncated result set for the model", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runAdminChatQuery.mockResolvedValue({ ok: true, rows: [], rowCount: 0, truncated: true });
      const out = await opts.executeTool(toolUse("tu1", "query_database", { sql: "s" }), vi.fn());
      expect(JSON.parse(out.content)).toEqual({
        rows: [],
        rowCount: 0,
        note: "truncated at 200 rows",
      });
    });

    it("passes a failed query's message back as an error", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      runAdminChatQuery.mockResolvedValue({ ok: false, error: "permission denied" });
      const out = await opts.executeTool(toolUse("tu1", "query_database", {}), vi.fn());
      expect(out).toEqual({ content: "permission denied", isError: true });
    });

    it("reports an unknown tool back to the model", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const out = await opts.executeTool(toolUse("tu1", "nope", {}), vi.fn());
      expect(out).toEqual({ content: "Unknown tool: nope", isError: true });
    });

    it("refuses a privileged call bundled with other tool calls", async () => {
      isPrivilegedChatUser.mockReturnValue(true);
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const out = await opts.executeTool(toolUse("tu2", "execute_write", {}), vi.fn());
      expect(performApprovedWrite).not.toHaveBeenCalled();
      expect(out).toEqual({
        content:
          "execute_write must be the only tool call in a turn. Finish your reads first, then call it alone.",
        isError: true,
      });
    });

    it("treats a privileged tool as unknown for an admin who cannot write", async () => {
      const opts = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const out = await opts.executeTool(toolUse("tu2", "execute_write", {}), vi.fn());
      expect(out).toEqual({ content: "Unknown tool: execute_write", isError: true });
    });
  });

  describe("the approval hook", () => {
    it("pauses only on a lone privileged call, and only for a privileged admin", async () => {
      isPrivilegedChatUser.mockReturnValue(true);
      const { approval } = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      const write = toolUse("tu9", "execute_write", {});
      expect(approval!.pauseFor([write])).toBe(write);
      expect(approval!.pauseFor([write, toolUse("tu8", "query_database", {})])).toBeNull();
      expect(approval!.pauseFor([toolUse("tu8", "query_database", {})])).toBeNull();
    });

    it("never pauses for an admin who cannot write", async () => {
      const { approval } = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      expect(approval!.pauseFor([toolUse("tu9", "execute_write", {})])).toBeNull();
    });

    it("dispatches each privileged tool to its own action, never a fall-through", async () => {
      isPrivilegedChatUser.mockReturnValue(true);
      const { approval } = await optionsFor({ messages: [{ role: "user", content: "q" }] });
      performApprovedWrite.mockResolvedValue({ ok: true, resultForModel: "w", chipDetail: "w" });
      performApprovedEmail.mockResolvedValue({ ok: true, resultForModel: "e", chipDetail: "e" });
      performApprovedPortalInvite.mockResolvedValue({ ok: true, resultForModel: "p", chipDetail: "p" });

      await approval!.run(toolUse("t1", "execute_write", { sql: "update x" }));
      expect(performApprovedWrite).toHaveBeenCalledWith({ sql: "update x" }, "admin@edge8.ai");
      await approval!.run(toolUse("t2", "send_email", { to: "a@b.c" }));
      expect(performApprovedEmail).toHaveBeenCalledWith({ to: "a@b.c" }, "admin@edge8.ai");
      await approval!.run(toolUse("t3", "invite_portal_member", { action: "invite" }));
      expect(performApprovedPortalInvite).toHaveBeenCalledWith(
        { action: "invite" },
        "admin@edge8.ai",
      );

      // An unrecognised privileged name must not reach the email tool.
      const out = await approval!.run(toolUse("t4", "future_tool", {}));
      expect(out).toEqual({
        ok: false,
        resultForModel: "Unknown privileged tool: future_tool",
        chipDetail: "Unknown privileged tool: future_tool",
      });
      expect(performApprovedEmail).toHaveBeenCalledTimes(1);
    });

    it("carries the decision and the matching pending tool_use into the loop", async () => {
      isPrivilegedChatUser.mockReturnValue(true);
      const { approval } = await optionsFor({
        messages: [
          { role: "user", content: "do it" },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "tu9", name: "execute_write", input: {} }],
          },
        ],
        decision: { toolUseId: "tu9", approved: true },
      });
      expect(approval!.decision).toEqual({ toolUseId: "tu9", approved: true });
      expect(approval!.pending).toMatchObject({ id: "tu9", name: "execute_write" });
      expect(approval!.declinedResult).toBe(
        "The admin declined this action. Do not retry it as-is; ask what they would like to change.",
      );
    });

    it("passes no pending tool_use when the request carries no decision", async () => {
      isPrivilegedChatUser.mockReturnValue(true);
      const { approval } = await optionsFor({
        messages: [
          { role: "user", content: "do it" },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "tu9", name: "execute_write", input: {} }],
          },
        ],
      });
      expect(approval!.pending).toBeNull();
      expect(approval!.decision).toBeUndefined();
    });

    it("400s a decision from a non-privileged admin", async () => {
      const res = await post({
        messages: [
          { role: "user", content: "do it" },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "tu9", name: "execute_write", input: {} }],
          },
        ],
        decision: { toolUseId: "tu9", approved: true },
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "No matching pending action" });
      expect(runChatTurn).not.toHaveBeenCalled();
    });

    it("400s a decision whose id does not match the pending tool_use", async () => {
      isPrivilegedChatUser.mockReturnValue(true);
      const res = await post({
        messages: [
          { role: "user", content: "do it" },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "tu9", name: "execute_write", input: {} }],
          },
        ],
        decision: { toolUseId: "other", approved: true },
      });
      expect(res.status).toBe(400);
      expect(runChatTurn).not.toHaveBeenCalled();
    });
  });
});
