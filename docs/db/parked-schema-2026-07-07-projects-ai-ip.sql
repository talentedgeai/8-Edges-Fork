-- PARKED SCHEMA SNAPSHOT — company_os Projects/AI-Platform/IP subsystems
-- Captured 2026-07-07 before the prune migration dropped these 18 (empty) tables.
-- These tables were created ad-hoc (no CREATE migration existed in git), so this
-- is the reversible record. Best-effort structural reconstruction from live
-- introspection: columns, types, defaults, PK/UNIQUE, and FKs. Does NOT include
-- indexes, CHECK constraints, triggers, RLS policies, or grants.
-- To fully revive you must also re-add the 3 inbound FK columns dropped on kept
-- tables: meeting_action_items.task_id, content_items.prompt_version_id,
-- content_ideas.source_research_note_id.

create schema if not exists company_os;

create table company_os.projects (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text unique,
  client_company_id uuid,
  deal_id uuid,
  status text default 'planned'::text not null,
  owner_id uuid,
  start_date date,
  due_date date,
  completed_at timestamp with time zone,
  description text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.project_members (
  id uuid default gen_random_uuid() not null,
  project_id uuid not null,
  person_id uuid not null,
  role text,
  allocation_pct numeric,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.milestones (
  id uuid default gen_random_uuid() not null,
  project_id uuid not null,
  name text not null,
  due_date date,
  status text default 'open'::text not null,
  position integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.tasks (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  project_id uuid,
  parent_task_id uuid,
  assignee_id uuid,
  created_by uuid,
  status text default 'todo'::text not null,
  priority text default 'medium'::text not null,
  due_date date,
  completed_at timestamp with time zone,
  subject_type text,
  subject_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.epics (
  id uuid default gen_random_uuid() not null,
  slug text not null unique,
  title text not null,
  problem_statement text,
  outcome text,
  status text default 'proposed'::text not null,
  priority text default 'medium'::text not null,
  app_id uuid,
  owner_id uuid,
  target_quarter text,
  started_at timestamp with time zone,
  shipped_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.epic_items (
  id uuid default gen_random_uuid() not null,
  epic_id uuid not null,
  title text not null,
  detail text,
  status text default 'todo'::text not null,
  position integer default 0 not null,
  task_id uuid,
  subject_type text,
  subject_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.apps (
  id uuid default gen_random_uuid() not null,
  slug text not null unique,
  name text not null,
  surface text default 'internal'::text not null,
  app_type text default 'web_app'::text not null,
  status text default 'idea'::text not null,
  owner_id uuid,
  integration_source_id uuid,
  repo_url text,
  repo_provider text,
  production_url text,
  staging_url text,
  description text,
  tech_stack jsonb default '[]'::jsonb not null,
  is_internal_tool boolean default true not null,
  launched_at timestamp with time zone,
  sunset_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.app_environments (
  id uuid default gen_random_uuid() not null,
  app_id uuid not null,
  name text not null,
  url text,
  hosting text,
  secret_ref text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.app_members (
  id uuid default gen_random_uuid() not null,
  app_id uuid not null,
  person_id uuid not null,
  role text default 'contributor'::text not null,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.agents_registry (
  id uuid default gen_random_uuid() not null,
  slug text not null unique,
  name text not null,
  role text,
  model text,
  app_id uuid,
  default_prompt_id uuid,
  config jsonb default '{}'::jsonb not null,
  active boolean default true not null,
  owner_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.prompts (
  id uuid default gen_random_uuid() not null,
  slug text not null unique,
  name text not null,
  category text,
  agent_id uuid,
  current_version_id uuid,
  owner_id uuid,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.prompt_versions (
  id uuid default gen_random_uuid() not null,
  prompt_id uuid not null,
  version integer not null,
  body text not null,
  variables jsonb default '[]'::jsonb not null,
  changelog text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.experiments (
  id uuid default gen_random_uuid() not null,
  slug text not null unique,
  title text not null,
  kind text default 'experiment'::text not null,
  hypothesis text,
  success_metric text,
  status text default 'proposed'::text not null,
  result text default 'pending'::text not null,
  result_notes text,
  app_id uuid,
  owner_id uuid,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.tools (
  id uuid default gen_random_uuid() not null,
  name text not null,
  vendor_id uuid,
  category text,
  monthly_cost_cents bigint,
  currency text default 'usd'::text not null,
  billing_cycle text default 'monthly'::text,
  renewal_date date,
  owner_id uuid,
  status text default 'active'::text not null,
  replace_target boolean default false not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.ip_assets (
  id uuid default gen_random_uuid() not null,
  slug text not null unique,
  name text not null,
  asset_type text default 'framework'::text not null,
  summary text,
  status text default 'draft'::text not null,
  owner_id uuid,
  current_version_id uuid,
  canonical_document_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.ip_asset_versions (
  id uuid default gen_random_uuid() not null,
  ip_asset_id uuid not null,
  version integer not null,
  body_markdown text not null,
  changelog text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.ip_asset_usages (
  id uuid default gen_random_uuid() not null,
  ip_asset_id uuid not null,
  subject_type text not null,
  subject_id uuid not null,
  note text,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);

create table company_os.research_notes (
  id uuid default gen_random_uuid() not null,
  title text not null,
  body_markdown text,
  topic text,
  status text default 'draft'::text not null,
  owner_id uuid,
  related_ip_asset_id uuid,
  source_meeting_id uuid,
  source_interaction_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  primary key (id)
);

-- Foreign keys
alter table company_os.projects add constraint projects_client_company_id_fkey foreign key (client_company_id) references company_os.companies(id);
alter table company_os.projects add constraint projects_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.projects add constraint projects_deal_id_fkey foreign key (deal_id) references company_os.deals(id);
alter table company_os.project_members add constraint project_members_person_id_fkey foreign key (person_id) references company_os.people(id);
alter table company_os.project_members add constraint project_members_project_id_fkey foreign key (project_id) references company_os.projects(id);
alter table company_os.milestones add constraint milestones_project_id_fkey foreign key (project_id) references company_os.projects(id);
alter table company_os.tasks add constraint tasks_created_by_fkey foreign key (created_by) references company_os.people(id);
alter table company_os.tasks add constraint tasks_assignee_id_fkey foreign key (assignee_id) references company_os.people(id);
alter table company_os.tasks add constraint tasks_parent_task_id_fkey foreign key (parent_task_id) references company_os.tasks(id);
alter table company_os.tasks add constraint tasks_project_id_fkey foreign key (project_id) references company_os.projects(id);
alter table company_os.epics add constraint epics_app_id_fkey foreign key (app_id) references company_os.apps(id);
alter table company_os.epics add constraint epics_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.epic_items add constraint epic_items_epic_id_fkey foreign key (epic_id) references company_os.epics(id);
alter table company_os.epic_items add constraint epic_items_task_id_fkey foreign key (task_id) references company_os.tasks(id);
alter table company_os.apps add constraint apps_integration_source_id_fkey foreign key (integration_source_id) references company_os.integration_sources(id);
alter table company_os.apps add constraint apps_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.app_environments add constraint app_environments_app_id_fkey foreign key (app_id) references company_os.apps(id);
alter table company_os.app_members add constraint app_members_app_id_fkey foreign key (app_id) references company_os.apps(id);
alter table company_os.app_members add constraint app_members_person_id_fkey foreign key (person_id) references company_os.people(id);
alter table company_os.agents_registry add constraint agents_registry_app_id_fkey foreign key (app_id) references company_os.apps(id);
alter table company_os.agents_registry add constraint agents_registry_default_prompt_fk foreign key (default_prompt_id) references company_os.prompts(id);
alter table company_os.agents_registry add constraint agents_registry_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.prompts add constraint prompts_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.prompts add constraint prompts_agent_id_fkey foreign key (agent_id) references company_os.agents_registry(id);
alter table company_os.prompts add constraint prompts_current_version_fk foreign key (current_version_id) references company_os.prompt_versions(id);
alter table company_os.prompt_versions add constraint prompt_versions_prompt_id_fkey foreign key (prompt_id) references company_os.prompts(id);
alter table company_os.prompt_versions add constraint prompt_versions_created_by_fkey foreign key (created_by) references company_os.people(id);
alter table company_os.experiments add constraint experiments_app_id_fkey foreign key (app_id) references company_os.apps(id);
alter table company_os.experiments add constraint experiments_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.tools add constraint tools_vendor_id_fkey foreign key (vendor_id) references company_os.vendors(id);
alter table company_os.tools add constraint tools_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.ip_assets add constraint ip_assets_owner_id_fkey foreign key (owner_id) references company_os.people(id);
alter table company_os.ip_assets add constraint ip_assets_canonical_document_id_fkey foreign key (canonical_document_id) references company_os.documents(id);
alter table company_os.ip_assets add constraint ip_assets_current_version_fk foreign key (current_version_id) references company_os.ip_asset_versions(id);
alter table company_os.ip_asset_versions add constraint ip_asset_versions_ip_asset_id_fkey foreign key (ip_asset_id) references company_os.ip_assets(id);
alter table company_os.ip_asset_versions add constraint ip_asset_versions_created_by_fkey foreign key (created_by) references company_os.people(id);
alter table company_os.ip_asset_usages add constraint ip_asset_usages_ip_asset_id_fkey foreign key (ip_asset_id) references company_os.ip_assets(id);
alter table company_os.research_notes add constraint research_notes_related_ip_asset_id_fkey foreign key (related_ip_asset_id) references company_os.ip_assets(id);
alter table company_os.research_notes add constraint research_notes_source_meeting_id_fkey foreign key (source_meeting_id) references company_os.meetings(id);
alter table company_os.research_notes add constraint research_notes_source_interaction_id_fkey foreign key (source_interaction_id) references company_os.interactions(id);
alter table company_os.research_notes add constraint research_notes_owner_id_fkey foreign key (owner_id) references company_os.people(id);
