-- Applied 2026-07-07 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migration `add_deals_referrer`. Additive only.
-- Canonical schema lives in the company-os repo; this file is a local record.
--
-- A deal can credit one referrer — the contact who sent the introduction.
-- referrer_id points at company_os.people so the referrer is a real, reusable
-- CRM contact (searchable, linkable), not free text. ON DELETE SET NULL keeps
-- the deal intact if the referrer is later erased (referral is a soft link and
-- must not block GDPR erasure of the person).
--
-- Wired in app/admin/(dashboard)/revenue/deals/actions.ts (setDealReferrer /
-- createReferrerForDeal) and the deal drawer's referrer typeahead.

alter table company_os.deals
  add column if not exists referrer_id uuid references company_os.people(id) on delete set null;

create index if not exists deals_referrer_id_idx on company_os.deals(referrer_id);
