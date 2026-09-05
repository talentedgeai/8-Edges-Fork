// Admin database assistant: streaming tool-use agent loop.
//
// The client POSTs the full messages array (echoed back from the previous
// turn's `done` event, plus the new user turn) — the server is stateless.
// SSE events: {type: "text" | "tool" | "approval" | "error" | "done"}. `done`
// carries the updated messages array for the client to echo next turn.
//
// query_database executes immediately under the restricted chatbot_reader role
// (entities/assistant/lib/admin-chat/db.ts). Privileged admins (the same
// entity's admin-chat/privileged.ts) also get execute_write and send_email —
// those NEVER execute inline. When the
// model calls one, the turn ends with an `approval` event (the messages array
// ends on that pending tool_use) and the widget shows Approve/Cancel. The next
// POST carries `decision`; only then does the action run (or a declined
// tool_result go back) and the loop continue. The approver and the request
// author are the same authenticated privileged admin, so the client echoing
// the pending tool_use back is not a trust problem — the tools' absence for
// everyone else is enforced here by the isPrivilegedChatUser gate.

import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/kernel/identity/admin-auth";
import { withHistoryCache } from "@/kernel/ai/cache";
import { logAiUsage } from "@/kernel/ai/response";
import { trimMessages } from "@/kernel/ai/messages";
// The assistant entity owns the chat back end (ME-08); this route composes it
// through the entity's index, which is the only path into it. The door spells
// out which of the two assistants each name belongs to, so the aliases here put
// the short names back for the body below.
import {
  runAdminChatQuery as runReadOnlyQuery,
  adminChatTools as chatbotTools,
  buildAdminChatPrompt as buildSystemPrompt,
  PRIVILEGED_TOOL_NAMES,
  isPrivilegedChatUser,
  performApprovedWrite,
  performApprovedEmail,
  performApprovedPortalInvite,
  upsertConversation,
  deriveTitle,
} from "@/entities/assistant";

// Multi-tool loops can run past 60s; requires Vercel fluid compute.
const MODEL = modelFor("admin-chat", "standard");
const MAX_ITERATIONS = 8;

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "approval"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; error: string }
  | {
      type: "done";
      messages: Anthropic.MessageParam[];
      conversationId: string | null;
      title: string | null;
    };

// Render items mirror the widget's DisplayItem shapes. The route builds this
// turn's items as it streams so the full visual transcript (incl. tool chips and
// approval cards) can be persisted alongside the (trimmed) model messages.
type TurnItem =
  | { kind: "bot"; text: string }
  | { kind: "tool"; name: string; detail: string }
  | {
      kind: "approval";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "pending";
    };

type Decision = { toolUseId: string; approved: boolean };

// The pending privileged tool_use a decision refers to: the last message must
// be an assistant turn whose ONLY tool_use is execute_write or send_email
// (that is the exact shape the loop below pauses on).
function getPendingToolUse(
  messages: Anthropic.MessageParam[],
): Anthropic.ToolUseBlock | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.content)) return null;
  const toolUses = last.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (toolUses.length !== 1 || !PRIVILEGED_TOOL_NAMES.has(toolUses[0].name)) return null;
  return toolUses[0];
}

async function runPrivilegedTool(
  tu: Anthropic.ToolUseBlock,
  adminEmail: string,
): Promise<{ ok: boolean; resultForModel: string; chipDetail: string }> {
  const input = tu.input as Record<string, unknown>;
  if (tu.name === "execute_write") return performApprovedWrite(input, adminEmail);
  if (tu.name === "invite_portal_member") return performApprovedPortalInvite(input, adminEmail);
  return performApprovedEmail(input, adminEmail);
}

export async function POST(request: NextRequest) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The assistant is not configured (missing API key)" },
      { status: 503 },
    );
  }

  let body: {
    messages?: Anthropic.MessageParam[];
    decision?: Decision;
    conversationId?: string | null;
    displayItems?: unknown[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? [...body.messages] : null;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }
  // Which saved conversation this belongs to (null = start a fresh one), and the
  // widget's complete visual history so far — the route appends this turn's items
  // to it before persisting.
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const priorItems = Array.isArray(body.displayItems) ? body.displayItems : [];

  const canWrite = isPrivilegedChatUser(user.email);

  // A decision must come from a privileged admin and match the pending
  // tool_use at the tail of the conversation.
  const decision = body.decision;
  const pending = decision ? getPendingToolUse(messages) : null;
  if (decision && (!canWrite || !pending || pending.id !== decision.toolUseId)) {
    return NextResponse.json({ error: "No matching pending action" }, { status: 400 });
  }

  const tools = chatbotTools({ canWrite });
  const system = buildSystemPrompt({ userEmail: user.email, canWrite });
  const client = anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Accumulate this turn's display items in lock-step with the SSE events, so
      // the persisted visual transcript matches what the widget renders. Streaming
      // text deltas coalesce into one bot bubble until a tool chip or approval card
      // breaks it. The approval card that a turn PAUSES on is captured here; the
      // card's later approved/declined status arrives inside the next request's
      // priorItems, so it is never double-counted.
      const turnItems: TurnItem[] = [];
      let currentBot: { kind: "bot"; text: string } | null = null;
      const appendBotText = (delta: string) => {
        if (currentBot) currentBot.text += delta;
        else {
          currentBot = { kind: "bot", text: delta };
          turnItems.push(currentBot);
        }
      };

      // Save on the `done` event: the transcript is fully assembled here, so this
      // never depends on a second client call. Best-effort — a save failure must
      // not break the reply, so it still emits `done` with the existing id.
      const finishDone = async () => {
        const displayItems = [...priorItems, ...turnItems];
        const trimmed = trimMessages(messages);
        const title = deriveTitle(displayItems);
        let savedId = conversationId;
        let savedTitle = title;
        try {
          const saved = await upsertConversation({
            id: conversationId,
            surface: "admin",
            authUserId: user.id,
            personId: null,
            title,
            messages: trimmed,
            displayItems,
          });
          if (saved) {
            savedId = saved.id;
            savedTitle = saved.title;
          }
        } catch (err) {
          console.error("admin chat persist:", err);
        }
        send({ type: "done", messages: trimmed, conversationId: savedId, title: savedTitle });
      };

      try {
        // Resolve the pending approval first: run (or decline) the action and
        // hand the tool_result to the model, then fall into the normal loop.
        if (decision && pending) {
          let result: Anthropic.ToolResultBlockParam;
          if (decision.approved) {
            const outcome = await runPrivilegedTool(pending, user.email);
            if (outcome.ok) {
              send({ type: "tool", name: pending.name, detail: outcome.chipDetail });
              currentBot = null; // a tool chip breaks the current bot bubble
              turnItems.push({ kind: "tool", name: pending.name, detail: outcome.chipDetail });
            }
            result = {
              type: "tool_result",
              tool_use_id: pending.id,
              content: outcome.resultForModel,
              is_error: !outcome.ok,
            };
          } else {
            result = {
              type: "tool_result",
              tool_use_id: pending.id,
              content:
                "The admin declined this action. Do not retry it as-is; ask what they would like to change.",
            };
          }
          messages.push({ role: "user", content: [result] });
        }

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const msgStream = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            output_config: { effort: "medium" },
            thinking: { type: "adaptive" },
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            tools,
            messages: withHistoryCache(messages),
          });
          msgStream.on("text", (delta) => {
            send({ type: "text", text: delta });
            appendBotText(delta);
          });
          const msg = await msgStream.finalMessage();
          logAiUsage("admin-chat", MODEL, msg.usage);

          messages.push({ role: "assistant", content: msg.content });
          if (msg.stop_reason !== "tool_use") break;

          const toolUses = msg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          // A lone privileged tool call pauses the turn for approval. The
          // pending tool_use stays unanswered at the tail of `messages`; the
          // widget's Approve/Cancel POSTs the decision that resolves it.
          if (
            canWrite &&
            toolUses.length === 1 &&
            PRIVILEGED_TOOL_NAMES.has(toolUses[0].name)
          ) {
            const tu = toolUses[0];
            send({
              type: "approval",
              id: tu.id,
              name: tu.name,
              input: tu.input as Record<string, unknown>,
            });
            currentBot = null; // the approval card breaks the current bot bubble
            turnItems.push({
              kind: "approval",
              id: tu.id,
              name: tu.name,
              input: tu.input as Record<string, unknown>,
              status: "pending",
            });
            await finishDone();
            return;
          }

          const results: Anthropic.ToolResultBlockParam[] = [];

          for (const tu of toolUses) {
            const input = tu.input as Record<string, unknown>;

            if (tu.name === "query_database") {
              const sql = typeof input.sql === "string" ? input.sql : "";
              const detail = sql.replace(/\s+/g, " ").slice(0, 120);
              send({ type: "tool", name: "query_database", detail });
              currentBot = null; // a tool chip breaks the current bot bubble
              turnItems.push({ kind: "tool", name: "query_database", detail });
              const res = await runReadOnlyQuery(sql);
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: res.ok
                  ? JSON.stringify({
                      rows: res.rows,
                      rowCount: res.rowCount,
                      ...(res.truncated ? { note: "truncated at 200 rows" } : {}),
                    })
                  : res.error,
                is_error: !res.ok,
              });
            } else if (canWrite && PRIVILEGED_TOOL_NAMES.has(tu.name)) {
              // Reached only when the call came bundled with other tool calls
              // (the lone-call case paused above).
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `${tu.name} must be the only tool call in a turn. Finish your reads first, then call it alone.`,
                is_error: true,
              });
            } else {
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `Unknown tool: ${tu.name}`,
                is_error: true,
              });
            }
          }

          messages.push({ role: "user", content: results });
        }

        await finishDone();
      } catch (err) {
        console.error("admin chat route:", err);
        send({
          type: "error",
          error:
            err instanceof Anthropic.APIError
              ? `The assistant hit an API error (${err.status ?? "network"}). Try again.`
              : "The assistant hit an unexpected error. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
