// Company-internal group coaching sessions (e.g. AIOlabz coaching), ingested
// from Zoom into company_os.meetings by scripts/crm/zoom-ingest.mjs. Unlike the
// client meeting hub, these are NOT tied to a client company: they are matched
// by source='zoom' and metadata.source_meeting_type='coaching', and carry no
// company_id. Read-only; the transcript and our own actionable summary live on
// the row (summary + metadata.transcript), action items in meeting_action_items.

import { companyOs } from "@/lib/supabase";

export type CoachingSessionRow = {
  id: string;
  title: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  speakers: string[];
  hasSummary: boolean;
};

export type CoachingActionItem = { title: string; detail: string | null; dueDate: string | null };

export type CoachingSessionDetail = CoachingSessionRow & {
  summary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  actionItems: CoachingActionItem[];
};

type MeetingRow = {
  id: string;
  title: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  recording_url: string | null;
  metadata: { speakers?: string[]; transcript?: string | null } | null;
};

const SELECT = "id, title, started_at, duration_seconds, summary, recording_url, metadata";

function toRow(m: MeetingRow): CoachingSessionRow {
  return {
    id: m.id,
    title: m.title,
    startedAt: m.started_at,
    durationSeconds: m.duration_seconds,
    speakers: Array.isArray(m.metadata?.speakers) ? (m.metadata?.speakers ?? []) : [],
    hasSummary: Boolean(m.summary),
  };
}

export async function listCoachingSessions(): Promise<CoachingSessionRow[]> {
  const { data } = await companyOs
    .from("meetings")
    .select(SELECT)
    .eq("source", "zoom")
    .eq("metadata->>source_meeting_type", "coaching")
    .is("archived_at", null)
    .order("started_at", { ascending: false, nullsFirst: false });
  return ((data ?? []) as MeetingRow[]).map(toRow);
}

export async function getCoachingSession(id: string): Promise<CoachingSessionDetail | null> {
  const { data } = await companyOs
    .from("meetings")
    .select(SELECT)
    .eq("id", id)
    .eq("source", "zoom")
    .eq("metadata->>source_meeting_type", "coaching")
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const m = data as MeetingRow;

  const { data: ai } = await companyOs
    .from("meeting_action_items")
    .select("title, detail, due_date, position")
    .eq("meeting_id", id)
    .order("position", { ascending: true });
  const actionItems = ((ai ?? []) as { title: string; detail: string | null; due_date: string | null }[]).map(
    (a) => ({ title: a.title, detail: a.detail, dueDate: a.due_date }),
  );

  return {
    ...toRow(m),
    summary: m.summary,
    transcript: m.metadata?.transcript ?? null,
    recordingUrl: m.recording_url,
    actionItems,
  };
}
