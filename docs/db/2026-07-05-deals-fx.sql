-- Applied 2026-07-05 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migration `add_deals_fx_columns`. Additive only.
-- Canonical schema lives in the company-os repo; this file is a local record.
--
-- Reporting/list views always show USD. amount_cents/currency stay the
-- original transaction record; amount_usd_cents is the derived USD value that
-- app/admin/(dashboard)/revenue/deals/actions.ts (updateDeal) refreshes via
-- lib/admin/fx.ts whenever a deal's amount or currency changes.

alter table company_os.deals add column if not exists amount_usd_cents bigint;
alter table company_os.deals add column if not exists fx_rate numeric;
alter table company_os.deals add column if not exists fx_rate_fetched_at timestamptz;

-- Backfill: USD rows convert at rate 1 (no FX lookup needed).
update company_os.deals
set amount_usd_cents = amount_cents,
    fx_rate = 1,
    fx_rate_fetched_at = now()
where currency = 'usd' and amount_usd_cents is null;

-- Backfill: the 4 existing AUD deals, priced at the AUD/USD rate as of
-- 2026-07-03 (0.69382, api.frankfurter.dev) since no per-deal FX history
-- was recorded before this migration.
update company_os.deals
set amount_usd_cents = round(amount_cents * 0.69382),
    fx_rate = 0.69382,
    fx_rate_fetched_at = now()
where currency = 'aud' and amount_usd_cents is null;
