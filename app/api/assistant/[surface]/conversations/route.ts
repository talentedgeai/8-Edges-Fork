// Shared history API for both assistants. `surface` (admin|team) comes from the
// path so identity is checked with the right guard: resolveAssistantActor() uses
// the admin gate for 'admin' and getTeamActor() for 'team', and every store call
// is scoped to that actor's own auth.uid(). One user can never list another user's
// conversations, nor cross the admin/team boundary.

import { NextResponse } from "next/server";
import { resolveAssistantActor } from "@/lib/assistant-history/actor";
import { listConversations } from "@/lib/assistant-history/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next 14 freezes fetch (and thus supabase-js reads) in route handlers even under
// force-dynamic; this keeps the list fresh per request.
export const fetchCache = "force-no-store";

export async function GET(
  _request: Request,
  { params }: { params: { surface: string } },
) {
  const actor = await resolveAssistantActor(params.surface);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversations = await listConversations({
    surface: actor.surface,
    authUserId: actor.authUserId,
  });
  return NextResponse.json({ conversations });
}
