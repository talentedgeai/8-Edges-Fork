// Team portal assistant: streaming, read-only tool-use agent loop.
//
// The client POSTs the full messages array (echoed back from the previous turn's
// `done` event, plus the new user turn) — the server is stateless. SSE events:
// {type: "text" | "tool" | "error" | "done"}. `done` carries the updated messages
// array for the client to echo next turn.
//
// This assistant is answer-only. Its single tool, query_database, executes
// immediately under the restricted team_chatbot_reader role
// (entities/assistant/lib/team-chat/db.ts), whose grants are the hard boundary
// on what staff can see. There are no write,
// email, or approval paths here — that surface exists only in the admin assistant.

import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/kernel/identity/team-auth";
import { withHistoryCache } from "@/kernel/ai/cache";
import { logAiUsage } from "@/kernel/ai/response";
import { trimMessages } from "@/kernel/ai/messages";
// The assistant entity owns the chat back end (ME-08); this route composes it
// through the entity's index, aliasing the door's disambiguated names back to
// the short ones the body reads with.
import {
  runTeamChatQuery as runReadOnlyQuery,
  teamChatTools as chatbotTools,
  buildTeamChatPrompt as buildSystemPrompt,
  upsertConversation,
  deriveTitle,
} from "@/entities/assistant";

// Multi-query loops can run past 60s; requires Vercel fluid compute.

const MODEL = modelFor("team-chat", "standard");
const MAX_ITERATIONS = 8;

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "error"; error: string }
  | {
      type: "done";
      messages: Anthropic.MessageParam[];
      conversationId: string | null;
      title: string | null;
    };

// Render items mirror the widget's DisplayItem shapes. The route builds this
// turn's items as it streams (see below) so the full visual transcript can be
// persisted alongside the (trimmed) model messages.
type TurnItem =
  | { kind: "bot"; text: string }
  | { kind: "tool"; detail: string };

export async function POST(request: NextRequest) {
  const { actor } = await getTeamActor();
  if (!actor) {
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

  const tools = chatbotTools();
  const system = buildSystemPrompt({ userName: actor.displayName });
  const client = anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Accumulate this turn's display items in lock-step with the SSE events, so
      // the persisted visual transcript matches what the widget renders. Streaming
      // text deltas coalesce into one bot bubble until a tool chip breaks it.
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
            surface: "team",
            authUserId: actor.authUserId,
            personId: actor.personId,
            title,
            messages: trimmed,
            displayItems,
          });
          if (saved) {
            savedId = saved.id;
            savedTitle = saved.title;
          }
        } catch (err) {
          console.error("team chat persist:", err);
        }
        send({ type: "done", messages: trimmed, conversationId: savedId, title: savedTitle });
      };

      try {
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
          logAiUsage("team-chat", MODEL, msg.usage);

          messages.push({ role: "assistant", content: msg.content });
          if (msg.stop_reason !== "tool_use") break;

          const toolUses = msg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const input = tu.input as Record<string, unknown>;
            if (tu.name === "query_database") {
              const sql = typeof input.sql === "string" ? input.sql : "";
              const detail = sql.replace(/\s+/g, " ").slice(0, 120);
              send({ type: "tool", name: "query_database", detail });
              currentBot = null; // a tool chip breaks the current bot bubble
              turnItems.push({ kind: "tool", detail });
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
        console.error("team chat route:", err);
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
