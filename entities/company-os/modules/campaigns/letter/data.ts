import { companyOs, type Json } from "@/kernel/data/supabase";
import { parseBroadcastBlocks, type BroadcastBlocks } from "@/entities/site/client";
import type { LetterState } from "./steps";

// The letter agent's reads and writes, in one file so the steps stay pure
// functions over data. Every Supabase call checks `error` before `data`.

export type DataPoint = { date: string; fact: string; source: string };

// What the steps hand each other between ticks, stored on agent_notes.
export type LetterNotes = {
  gathered?: DataPoint[];
  gatheredAt?: string;
  picked?: { id: string; title: string; pillar: string | null }[];
  checklist?: string[];
  testSentTo?: string;
};

export type Letter = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  bodyMd: string;
  blocks: BroadcastBlocks;
  brandId: string | null;
  status: string;
  fromEmail: string | null;
  replyTo: string | null;
  agentStep: string | null;
  agentError: string | null;
  agentStartedAt: string | null;
  notes: LetterNotes;
};

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadLetter(id: string): Promise<Loaded<Letter>> {
  const { data, error } = await companyOs
    .from("email_campaigns")
    .select("id, name, subject, preheader, body_md, blocks, brand_id, status, from_email, reply_to, agent_step, agent_error, agent_started_at, agent_notes")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Broadcast not found." };
  return {
    ok: true,
    data: {
      id: data.id,
      name: data.name,
      subject: data.subject,
      preheader: data.preheader,
      bodyMd: data.body_md,
      blocks: parseBroadcastBlocks(data.blocks),
      brandId: data.brand_id,
      status: data.status,
      fromEmail: data.from_email,
      replyTo: data.reply_to,
      agentStep: data.agent_step,
      agentError: data.agent_error,
      agentStartedAt: data.agent_started_at,
      notes: (data.agent_notes && typeof data.agent_notes === "object" ? data.agent_notes : {}) as LetterNotes,
    },
  };
}

export async function setAgentState(
  id: string,
  state: { step: LetterState | null; error: string | null; startedAt?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fields: { agent_step: string | null; agent_error: string | null; agent_started_at?: string | null } = {
    agent_step: state.step,
    agent_error: state.error,
  };
  if (state.startedAt !== undefined) fields.agent_started_at = state.startedAt;
  const { error } = await companyOs.from("email_campaigns").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Merges into agent_notes so each step keeps what the earlier ones learned.
export async function saveNotes(letter: Letter, patch: LetterNotes): Promise<{ ok: true } | { ok: false; error: string }> {
  const notes = { ...letter.notes, ...patch } as Json;
  const { error } = await companyOs.from("email_campaigns").update({ agent_notes: notes }).eq("id", letter.id);
  if (error) return { ok: false, error: error.message };
  letter.notes = notes as LetterNotes;
  return { ok: true };
}

export async function updateLetter(
  id: string,
  fields: Partial<{ subject: string; preheader: string; body_md: string; blocks: BroadcastBlocks }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs.from("email_campaigns").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The most recent broadcasts that went out or are about to, newest first:
// what the rotation and the "never sent" rule read.
export async function recentSentLetters(limit = 6): Promise<{ subject: string; blocks: BroadcastBlocks; createdAt: string }[]> {
  const { data, error } = await companyOs
    .from("email_campaigns")
    .select("subject, blocks, created_at")
    .in("status", ["approved", "sending", "sent"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[letter] recent letters read failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ subject: r.subject, blocks: parseBroadcastBlocks(r.blocks), createdAt: r.created_at }));
}
