-- Applied 2026-07-05 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migrations `add_site_admins_table` + `grant_service_role_on_admins`.
-- Additive only. Canonical schema lives in the company-os repo; this is a local
-- record. (A helper RPC company_os.auth_user_by_email shipped in the first
-- migration was dropped again in `drop_auth_user_by_email_fn` — the app
-- standardized on auth.admin.listUsers for auth-user lookups instead.)
--
-- Site admins: DB-managed allowlist for /admin console access. The auth gate
-- (lib/admin-auth.ts) treats "admin" as: valid Supabase session AND email in
-- this table OR in the ADMIN_ALLOWLIST env var (break-glass fallback).

create table if not exists company_os.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists admins_email_lower_idx on company_os.admins (lower(email));

-- The app reaches company_os via the service-role key; new tables created by
-- postgres don't inherit grants in this schema (no default privileges set).
grant select, insert, update, delete on company_os.admins to service_role;
