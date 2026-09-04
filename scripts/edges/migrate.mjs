// Eight Edges: create the goal tables in company_os (PR 1 of the build plan,
// docs/product/eight-edges/eight-edges-engineering-plan.md).
// Run from the repo root: node scripts/edges/migrate.mjs
// Idempotent: every statement is IF NOT EXISTS / guarded, safe to re-run.
import { sql } from '../crm/db.mjs';

const statements = [
  `create table if not exists company_os.strategies (
    id uuid primary key default gen_random_uuid(),
    year int not null unique,
    title text not null,
    body_md text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  // objectives.parent_kr_id points at key_results; the FK is added after
  // key_results exists (the two tables reference each other).
  `create table if not exists company_os.objectives (
    id uuid primary key default gen_random_uuid(),
    strategy_id uuid references company_os.strategies(id),
    level text not null check (level in ('company','office','executor')),
    office text check (office in ('revenue','talent','operations','innovation')),
    business_line text check (business_line in ('staffing','ai_programs')),
    parent_kr_id uuid,
    quarter text not null,
    title text not null,
    status text not null default 'active' check (status in ('active','done','dropped')),
    owner_person_id uuid references company_os.people(id),
    owner_agent text,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- The cascade rule: only company-level objectives may float free.
    constraint objectives_cascade_link check (level = 'company' or parent_kr_id is not null)
  )`,

  `create table if not exists company_os.key_results (
    id uuid primary key default gen_random_uuid(),
    objective_id uuid not null references company_os.objectives(id) on delete cascade,
    title text not null,
    target_value numeric,
    current_value numeric not null default 0,
    unit text,
    direction text not null default 'up' check (direction in ('up','down')),
    delivery_mix text not null default 'human' check (delivery_mix in ('human','ai','blended')),
    -- The governance rule: every key result names one accountable human.
    accountable_person_id uuid not null references company_os.people(id),
    executing_agent text,
    status text not null default 'on_track' check (status in ('on_track','at_risk','off_track','done')),
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  `do $$ begin
    alter table company_os.objectives
      add constraint objectives_parent_kr_fkey
      foreign key (parent_kr_id) references company_os.key_results(id);
  exception when duplicate_object then null; end $$`,

  `create table if not exists company_os.metrics (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    office text not null check (office in ('revenue','talent','operations','innovation')),
    formula text,
    target numeric,
    direction text not null default 'up' check (direction in ('up','down')),
    source text not null default 'manual' check (source in ('agent','manual')),
    source_detail text,
    owner_person_id uuid references company_os.people(id),
    owner_agent text,
    key_result_id uuid references company_os.key_results(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  `create table if not exists company_os.metric_readings (
    id uuid primary key default gen_random_uuid(),
    metric_id uuid not null references company_os.metrics(id) on delete cascade,
    week_start date not null,
    value numeric not null,
    collected_by text not null,
    created_at timestamptz not null default now(),
    unique (metric_id, week_start)
  )`,

  `create table if not exists company_os.issues (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    diagnosis text not null default 'system' check (diagnosis in ('goal','system','execution')),
    key_result_id uuid references company_os.key_results(id) on delete set null,
    filed_by text not null,
    status text not null default 'open' check (status in ('open','solving','solved','dropped')),
    notes_md text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
  )`,

  // Every issue is assigned to a person who owns solving it. Nullable at the
  // DB level (pre-existing rows, auto-filed issues with no metric owner); the
  // UI requires it when filing.
  `alter table company_os.issues add column if not exists
    assignee_person_id uuid references company_os.people(id) on delete set null`,

  `create table if not exists company_os.sync_packets (
    id uuid primary key default gen_random_uuid(),
    week_start date not null unique,
    body_md text not null,
    created_by text not null,
    created_at timestamptz not null default now()
  )`,

  // RLS on, no policies: the app and agents use the service key, which
  // bypasses RLS; everything else is locked out. Matches sibling tables.
  `alter table company_os.strategies enable row level security`,
  `alter table company_os.objectives enable row level security`,
  `alter table company_os.key_results enable row level security`,
  `alter table company_os.metrics enable row level security`,
  `alter table company_os.metric_readings enable row level security`,
  `alter table company_os.issues enable row level security`,
  `alter table company_os.sync_packets enable row level security`,

  // Every metric needs an owner: a person, an agent, or both.
  `do $$ begin
    alter table company_os.metrics add constraint metrics_owner_required
      check (owner_person_id is not null or owner_agent is not null);
  exception when duplicate_object then null; end $$`,

  // Grants to match the sibling company_os tables. Tables created over the
  // postgres connection do NOT inherit these; without them PostgREST returns
  // "permission denied" even to the service key.
  ...['strategies', 'objectives', 'key_results', 'metrics', 'metric_readings', 'issues', 'sync_packets'].flatMap(
    (t) => [
      `grant select, insert, update, delete on company_os.${t} to service_role`,
      `grant select on company_os.${t} to team_chatbot_reader`,
      `grant select on company_os.${t} to chatbot_reader`,
    ],
  ),
];

for (const s of statements) await sql.unsafe(s);
console.log(`applied ${statements.length} statements`);
await sql.end();
