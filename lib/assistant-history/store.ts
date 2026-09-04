// Server-only persistence for the assistant chat history (both /admin and /team).
// Backs company_os.assistant_conversations via the service-role client
// (lib/supabase.ts). Every function scopes on (surface, owner_auth_user_id) so
// no cross-user or cross-surface access is expressible — the table's RLS (on, no
// policies) is a second layer, and these explicit filters are the primary one
// since the service-role client bypasses RLS. NEVER import from a client component.

import { companyOs } from "@/lib/supabase";

export type Surface = "admin" | "team";

export type ConversationSummary = {
  id: string;
  title: string;
  last_message_at: string | null;
};

export type ConversationRow = {
  id: string;
  surface: Surface;
  title: string;
  messages: unknown[];
  display_items: unknown[];
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "assistant_conversations";

type OwnerScope = { surface: Surface; authUserId: string };

// The current user's active conversations for one surface, newest first.
export async function listConversations({
  surface,
  authUserId,
}: OwnerScope): Promise<ConversationSummary[]> {
  const { data, error } = await companyOs
    .from(TABLE)
    .select("id, title, last_message_at")
    .eq("surface", surface)
    .eq("owner_auth_user_id", authUserId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    console.error("listConversations:", error.message);
    return [];
  }
  return (data ?? []) as ConversationSummary[];
}

// One full conversation (transcript + display items), or null if it does not
// exist / is archived / belongs to another user or surface.
export async function getConversation({
  id,
  surface,
  authUserId,
}: OwnerScope & { id: string }): Promise<ConversationRow | null> {
  const { data, error } = await companyOs
    .from(TABLE)
    .select("id, surface, title, messages, display_items, last_message_at, created_at, updated_at")
    .eq("id", id)
    .eq("surface", surface)
    .eq("owner_auth_user_id", authUserId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("getConversation:", error.message);
    return null;
  }
  return (data as ConversationRow | null) ?? null;
}

// Create (id absent) or update (id present, owner-scoped) a conversation. Returns
// the id + title, or null if the write failed. Best-effort by design: a failed
// save must never break the chat, so callers ignore null and carry on.
export async function upsertConversation({
  id,
  surface,
  authUserId,
  personId,
  title,
  messages,
  displayItems,
}: OwnerScope & {
  id?: string | null;
  personId?: string | null;
  title: string;
  messages: unknown[];
  displayItems: unknown[];
}): Promise<{ id: string; title: string } | null> {
  const now = new Date().toISOString();

  if (id) {
    const { data, error } = await companyOs
      .from(TABLE)
      .update({
        title,
        messages,
        display_items: displayItems,
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("surface", surface)
      .eq("owner_auth_user_id", authUserId)
      .is("archived_at", null)
      .select("id, title")
      .maybeSingle();
    if (error) {
      console.error("upsertConversation (update):", error.message);
      return null;
    }
    // A matched row is returned; a stale/foreign id matches nothing — fall
    // through and start a fresh conversation owned by the current user.
    if (data) return data as { id: string; title: string };
  }

  const { data, error } = await companyOs
    .from(TABLE)
    .insert({
      surface,
      owner_auth_user_id: authUserId,
      owner_person_id: personId ?? null,
      title,
      messages,
      display_items: displayItems,
      last_message_at: now,
    })
    .select("id, title")
    .maybeSingle();
  if (error) {
    console.error("upsertConversation (insert):", error.message);
    return null;
  }
  return (data as { id: string; title: string } | null) ?? null;
}

// Rename a conversation. Owner-scoped; returns whether a row was changed.
export async function renameConversation({
  id,
  surface,
  authUserId,
  title,
}: OwnerScope & { id: string; title: string }): Promise<boolean> {
  const { error } = await companyOs
    .from(TABLE)
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("surface", surface)
    .eq("owner_auth_user_id", authUserId)
    .is("archived_at", null);
  if (error) {
    console.error("renameConversation:", error.message);
    return false;
  }
  return true;
}

// Soft-delete a conversation (archived_at), matching Company OS convention.
export async function archiveConversation({
  id,
  surface,
  authUserId,
}: OwnerScope & { id: string }): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await companyOs
    .from(TABLE)
    .update({ archived_at: now, updated_at: now })
    .eq("id", id)
    .eq("surface", surface)
    .eq("owner_auth_user_id", authUserId)
    .is("archived_at", null);
  if (error) {
    console.error("archiveConversation:", error.message);
    return false;
  }
  return true;
}
