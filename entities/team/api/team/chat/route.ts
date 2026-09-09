// Team portal assistant: streaming, read-only tool-use agent loop.
//
// The client POSTs the full messages array (echoed back from the previous turn's
// `done` event, plus the new user turn) — the server is stateless. SSE events:
// {type: "text" | "tool" | "error" | "done"}. `done` carries the updated messages
// array for the client to echo next turn.
//
// The loop itself is runChatTurn (entities/assistant/lib/chat-turn.ts), shared
// with the admin assistant. This surface passes NO `approval` hook, which is
// what makes the pause/resume path structurally absent here rather than merely
// unreachable.
//
// This assistant is answer-only, with one deliberate exception. Its query tool,
// query_database, executes immediately under the restricted team_chatbot_reader
// role (entities/assistant/lib/team-chat/db.ts), whose grants are the hard
// boundary on what staff can see. request_review_link (offered to admins, the
// talent director, and managers) adds reviewers to a performance review and
// returns links; it re-checks the caller against the subject inside the team
// entity. There are no general write, email, or approval paths here — that
// surface exists only in the admin assistant.

import type Anthropic from "@anthropic-ai/sdk";
import { anthropicIfConfigured } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/kernel/identity/team-auth";
import { requestReviewLinks } from "@/entities/team/lib/reviews/chat-tool";
import { TALENT_DIRECTOR_EMAIL } from "@/entities/team/modules/onboarding/cycle-constants";
// The assistant entity owns the chat back end (ME-08); this route composes it
// through the entity's index, aliasing the door's disambiguated names back to
// the short ones the body reads with.
import {
  runTeamChatQuery as runReadOnlyQuery,
  teamChatTools as chatbotTools,
  buildTeamChatPrompt as buildSystemPrompt,
  runChatTurn,
  type ChatSseEvent,
} from "@/entities/assistant";

const MODEL = modelFor("team-chat", "standard");

export async function POST(request: NextRequest) {
  const { actor } = await getTeamActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = anthropicIfConfigured();
  if (!client) {
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

  const canRequestReviews = actor.isAdmin || actor.role === "manager" || actor.email === TALENT_DIRECTOR_EMAIL;
  const tools = chatbotTools({ canRequestReviews });
  const system = buildSystemPrompt({ userName: actor.displayName });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatSseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await runChatTurn({
          client,
          model: MODEL,
          system,
          tools,
          messages,
          usageSite: "team-chat",
          logLabel: "team chat",
          conversationId,
          priorItems,
          persist: {
            surface: "team",
            authUserId: actor.authUserId,
            personId: actor.personId,
          },
          // The team transcript has only ever stored the chip's detail: its one
          // chip label is fixed, so the name would be dead weight in every row.
          recordToolName: false,
          send,
          executeTool: async (tu, chip) => {
            const input = tu.input as Record<string, unknown>;
            if (tu.name === "query_database") {
              const sql = typeof input.sql === "string" ? input.sql : "";
              chip("query_database", sql.replace(/\s+/g, " ").slice(0, 120));
              const res = await runReadOnlyQuery(sql);
              return {
                content: res.ok
                  ? JSON.stringify({
                      rows: res.rows,
                      rowCount: res.rowCount,
                      ...(res.truncated ? { note: "truncated at 200 rows" } : {}),
                    })
                  : res.error,
                isError: !res.ok,
              };
            }
            if (tu.name === "request_review_link" && canRequestReviews) {
              const subject = typeof input.subject === "string" ? input.subject : "";
              chip("request_review_link", `review link: ${subject}`.slice(0, 120));
              const outcome = await requestReviewLinks(actor, {
                subject,
                reviewers: Array.isArray(input.reviewers) ? (input.reviewers as Array<{ name?: string; email?: string }>) : [],
                send: input.send === true,
              });
              return { content: JSON.stringify(outcome), isError: !outcome.ok };
            }
            return { content: `Unknown tool: ${tu.name}`, isError: true };
          },
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
