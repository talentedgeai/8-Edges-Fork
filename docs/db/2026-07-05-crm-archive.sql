-- Applied 2026-07-05 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migration `add_archive_columns_crm`. Additive only.
-- Canonical schema lives in the company-os repo; this file is a local record.
--
-- Adds soft-delete (archive) support to the CRM's archivable entities. The
-- existing company_os.audit_log table (unchanged here) captures who did what.

alter table company_os.people    add column if not exists archived_at timestamptz;
alter table company_os.people    add column if not exists archived_by text;
alter table company_os.companies add column if not exists archived_at timestamptz;
alter table company_os.companies add column if not exists archived_by text;
alter table company_os.deals     add column if not exists archived_at timestamptz;
alter table company_os.deals     add column if not exists archived_by text;

-- Partial indexes: list views read active (non-archived) rows newest-first.
create index if not exists people_active_idx    on company_os.people    (created_at desc) where archived_at is null;
create index if not exists companies_active_idx on company_os.companies (created_at desc) where archived_at is null;
create index if not exists deals_active_idx     on company_os.deals     (created_at desc) where archived_at is null;
