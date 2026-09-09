-- 02-rebrand.sql — apply AFTER 00-prereqs.sql and 01-schema.sql.
--
-- Why this file exists
-- --------------------
-- README Step 1b renames the brand in three layers of the application code.
-- It does not mention that the old brand slug is also a DATA VALUE baked into
-- 01-schema.sql: four CHECK constraints and three column defaults hardcode
-- 'edge8'. Applying the rebrand to the code alone leaves the database
-- rejecting every row the rebranded code writes, with errors like:
--
--   new row for relation "objectives" violates check constraint
--   "objectives_brand_check"
--
-- The failure surfaces late — the app builds, deploys and signs in fine, and
-- only breaks the first time someone creates an objective, a service line, a
-- backlog item or an invoice. So this runs at setup time, not later.
--
-- It also drops 'aio' (AI Officer Institute — the upstream's second brand),
-- because the rebranded TypeScript unions no longer accept that value and a
-- row carrying it would fail to typecheck on read.
--
-- Safe to re-run: every statement drops the constraint before adding it.
-- Schema only, no rows. If you rebrand again, change the four literals below.

set search_path = company_os, public;

-- company_os.client_backlog_items.source — who proposed a backlog item:
-- us ('arca-wellness') or the client ('client').
alter table company_os.client_backlog_items
  alter column source set default 'arca-wellness';
alter table company_os.client_backlog_items
  drop constraint if exists client_backlog_items_source_check;
alter table company_os.client_backlog_items
  add constraint client_backlog_items_source_check
  check (source = any (array['arca-wellness'::text, 'client'::text]));

-- company_os.invoices.entity — which legal entity / QuickBooks company an
-- invoice belongs to. Mirrors QboEntity and InvoiceEntity in the code.
alter table company_os.invoices
  alter column entity set default 'arca-wellness';
alter table company_os.invoices
  drop constraint if exists invoices_entity_check;
alter table company_os.invoices
  add constraint invoices_entity_check
  check (entity = any (array['arca-wellness'::text]));

-- company_os.objectives.brand — which brand an objective belongs to.
-- Mirrors BRANDS in entities/company-os/lib/company/edges-shared.ts.
alter table company_os.objectives
  drop constraint if exists objectives_brand_check;
alter table company_os.objectives
  add constraint objectives_brand_check
  check (brand = any (array['arca-wellness'::text]));

-- company_os.service_lines.business_unit — mirrors BRANDS as above.
alter table company_os.service_lines
  drop constraint if exists service_lines_business_unit_check;
alter table company_os.service_lines
  add constraint service_lines_business_unit_check
  check (business_unit = any (array['arca-wellness'::text]));

-- company_os.qbo_connection.id — the row id IS the entity string, and the
-- OAuth callback writes it from QboEntity.
alter table company_os.qbo_connection
  alter column id set default 'arca-wellness';

-- Verify: all four constraints should mention arca-wellness and not edge8.
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname in ('client_backlog_items_source_check',
--                      'invoices_entity_check',
--                      'objectives_brand_check',
--                      'service_lines_business_unit_check');
