// Roadmap propose assist (PR 4): a small, non-streaming Q&A that drafts one
// roadmap item. Deliberately simpler than the program-plan chat: replies are a
// sentence or two, so a single JSON response beats SSE plumbing. Stateless like
// its siblings: the client echoes the full messages array each turn. The final
// model turn carries a fenced json block; we parse it server-side and hand the
// client a ready-to-fill draft. Nothing is submitted here; the client reviews
// and sends through the normal propose action (role-gated, PR 2).

import { anthropic } from "@/kernel/ai/client";
import { modelFor } from "@/kernel/ai/models";
import { NextRequest, NextResponse } from "next/server";
import { getPortalActor } from "@/kernel/identity/portal-auth";
import { contributorCompanyScope } from "@/entities/portal/lib/roles";
import { getGroupsForActor } from "@/entities/portal/lib/backlog";
import { buildRoadmapAssistPrompt } from "@/entities/portal/lib/roadmap-assist-prompt";
import { isBacklogPriority } from "@/entities/portal/lib/client-backlog";
import { readTextOutput } from "@/kernel/ai/response";

const MODEL = modelFor("roadmap-assist", "fast");
const MAX_MESSAGES = 20;

export type RoadmapDraft = {
  title: string;
  note: string;
  groupKey: string;
  priority: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseDraft(text: string, validKeys: string[]): RoadmapDraft | null {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Partial<RoadmapDraft>;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
    const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 1000) : "";
    if (!title) return null;
    const groupKey = validKeys.includes(raw.groupKey ?? "")
      ? (raw.groupKey as string)
      : validKeys[0] ?? "";
    const priority = isBacklogPriority(raw.priority ?? "") ? (raw.priority as string) : "next";
    return { title, note, groupKey, priority };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { actor } = await getPortalActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Same gate as proposing itself: viewers don't get the assist either.
  if (contributorCompanyScope(actor).length === 0) {
    return NextResponse.json({ error: "Your portal role does not allow proposing items." }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The assistant is not configured (missing API key)" }, { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0,
    )
    .slice(-MAX_MESSAGES);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "messages must end with a user turn" }, { status: 400 });
  }

  const groups = await getGroupsForActor(actor);
  if (groups.length === 0) {
    return NextResponse.json({ error: "Your roadmap has no sections yet, so there is nowhere to propose an item." }, { status: 409 });
  }
  const system = `${buildRoadmapAssistPrompt(groups)}\n\nThe client's name is ${actor.displayName}.`;
  try {
    const client = anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
    });
    const out = readTextOutput("roadmap-assist", MODEL, msg);
    if (!out.ok) {
      console.error("portal roadmap-assist:", out.error);
      return NextResponse.json({ error: "The assistant hit a problem. Please try again." }, { status: 502 });
    }
    const text = out.text;
    const draft = parseDraft(text, groups.map((g) => g.key));
    const reply = draft ? text.replace(/```json[\s\S]*?```/, "").trim() : text.trim();
    return NextResponse.json({
      reply,
      draft,
      messages: [...messages, { role: "assistant", content: text }].slice(-MAX_MESSAGES),
    });
  } catch (err) {
    console.error("portal roadmap-assist route:", err);
    return NextResponse.json({ error: "The assistant hit a problem. Please try again." }, { status: 502 });
  }
}
