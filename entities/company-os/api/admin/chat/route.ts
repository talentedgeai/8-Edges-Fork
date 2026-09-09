// Admin database assistant: streaming tool-use agent loop.
//
// The client POSTs the full messages array (echoed back from the previous
// turn's `done` event, plus the new user turn) — the server is stateless.
// SSE events: {type: "text" | "tool" | "approval" | "error" | "done"}. `done`
// carries the updated messages array for the client to echo next turn.
//
// The loop itself is runChatTurn (entities/assistant/lib/chat-turn.ts), shared
// with the team assistant; this file is the admin surface's half of it — who
// the actor is, which tools exist, and the approval hook below.
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

import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/kernel/identity/admin-auth";
// The assistant entity owns the chat back end (ME-08); this route composes it
// through the entity's index, which is the only path into it. The door spells
// out which of the two assistants each name belongs to, so the aliases here put
// the short names back for the body below.
import {
  runAdminChatQuery as runReadOnlyQuery,
  adminChatTools as chatbotTools,
  buildAdminChatPrompt as buildSystemPrompt,
  runChatTurn,
  PRIVILEGED_TOOL_NAMES,
  isPrivilegedChatUser,
  performApprovedWrite,
  performApprovedEmail,
  performApprovedPortalInvite,
  type ChatSseEvent,
} from "@/entities/assistant";
import { getPendingToolUse } from "./pending-tool";

const MODEL = modelFor("admin-chat", "standard");

type Decision = { toolUseId: string; approved: boolean };

async function runPrivilegedTool(
  tu: Anthropic.ToolUseBlock,
  adminEmail: string,
): Promise<{ ok: boolean; resultForModel: string; chipDetail: string }> {
  const input = tu.input as Record<string, unknown>;
  // Explicit per-tool dispatch: the previous fall-through sent any unrecognised
  // name to the email tool, so a new privileged tool would silently mail someone.
  switch (tu.name) {
    case "execute_write":
      return performApprovedWrite(input, adminEmail);
    case "invite_portal_member":
      return performApprovedPortalInvite(input, adminEmail);
    case "send_email":
      return performApprovedEmail(input, adminEmail);
    default:
      return {
        ok: false,
        resultForModel: `Unknown privileged tool: ${tu.name}`,
        chipDetail: `Unknown privileged tool: ${tu.name}`,
      };
  }
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
          usageSite: "admin-chat",
          logLabel: "admin chat",
          conversationId,
          priorItems,
          persist: { surface: "admin", authUserId: user.id, personId: null },
          recordToolName: true,
          send,
          approval: {
            pending,
            decision,
            // A lone privileged tool call pauses the turn for approval; bundled
            // with other calls it falls through to executeTool, which refuses it.
            pauseFor: (toolUses) =>
              canWrite && toolUses.length === 1 && PRIVILEGED_TOOL_NAMES.has(toolUses[0].name)
                ? toolUses[0]
                : null,
            run: (tu) => runPrivilegedTool(tu, user.email),
            declinedResult:
              "The admin declined this action. Do not retry it as-is; ask what they would like to change.",
          },
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
            if (canWrite && PRIVILEGED_TOOL_NAMES.has(tu.name)) {
              // Reached only when the call came bundled with other tool calls
              // (the lone-call case paused above).
              return {
                content: `${tu.name} must be the only tool call in a turn. Finish your reads first, then call it alone.`,
                isError: true,
              };
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
