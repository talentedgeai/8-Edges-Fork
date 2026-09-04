// Sales Intelligence PR 1: call transcript tables in company_os.
// Run from the repo root: node scripts/calls/migrate.mjs
// Idempotent: every statement is IF NOT EXISTS / guarded, safe to re-run.
import { sql } from '../crm/db.mjs';

const statements = [
  // One row per recorded call. minute_token is the Lark Minutes dedup key;
  // rows imported from pasted/uploaded transcripts have none. meeting_id is
  // unique so a re-run of any importer never duplicates a call.
  `create table if not exists company_os.call_transcripts (
    id uuid primary key default gen_random_uuid(),
    minute_token text unique,
    meeting_id uuid unique references company_os.meetings(id) on delete set null,
    title text not null,
    started_at timestamptz,
    duration_seconds int,
    source text not null default 'lark_minutes',
    call_type text not null default 'other' check (call_type in ('sales','client','internal','other')),
    transcript text not null,
    search tsvector generated always as (
      to_tsvector('english', coalesce(title, '') || ' ' || transcript)
    ) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  `create index if not exists call_transcripts_search_idx
    on company_os.call_transcripts using gin (search)`,
  `create index if not exists call_transcripts_started_at_idx
    on company_os.call_transcripts (started_at desc)`,

  // One scorecard per call: the two deterministic measures plus the five
  // Roberge dimensions (1-5). scored_by is 'agent' for the weekly pass,
  // 'dave' for manual overrides from the page.
  `create table if not exists company_os.call_scorecards (
    id uuid primary key default gen_random_uuid(),
    call_transcript_id uuid not null unique
      references company_os.call_transcripts(id) on delete cascade,
    talk_ratio numeric check (talk_ratio >= 0 and talk_ratio <= 1),
    question_count int,
    score_talk_ratio smallint check (score_talk_ratio between 1 and 5),
    score_pain_quantified smallint check (score_pain_quantified between 1 and 5),
    score_product_fit smallint check (score_product_fit between 1 and 5),
    score_objection_surfaced smallint check (score_objection_surfaced between 1 and 5),
    score_next_step smallint check (score_next_step between 1 and 5),
    coaching_md text,
    scored_by text not null default 'agent',
    scored_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  // RLS on, no policies: the app and agents use the service key, which
  // bypasses RLS; everything else is locked out. Matches sibling tables.
  `alter table company_os.call_transcripts enable row level security`,
  `alter table company_os.call_scorecards enable row level security`,

  // Grants to match the sibling company_os tables. Tables created over the
  // postgres connection do NOT inherit these; without them PostgREST returns
  // "permission denied" even to the service key.
  ...['call_transcripts', 'call_scorecards'].flatMap((t) => [
    `grant select, insert, update, delete on company_os.${t} to service_role`,
    `grant select on company_os.${t} to team_chatbot_reader`,
    `grant select on company_os.${t} to chatbot_reader`,
  ]),
];

for (const s of statements) await sql.unsafe(s);
console.log(`applied ${statements.length} statements`);
await sql.end();
