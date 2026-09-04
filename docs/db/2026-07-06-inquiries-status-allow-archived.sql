-- 2026-07-06  inquiries.status: allow 'archived'
--
-- The admin archiveInquiry() action sets status='archived', but the CHECK
-- constraint never included that value, so archiving an inquiry always failed
-- with a constraint violation (the archive button was silently broken).
-- Widen the allowed set to include 'archived'. Additive only; no existing rows
-- are affected. Applied to prod via Supabase migration
-- `inquiries_status_allow_archived`.

ALTER TABLE company_os.inquiries DROP CONSTRAINT inquiries_status_check;

ALTER TABLE company_os.inquiries ADD CONSTRAINT inquiries_status_check
  CHECK (status = ANY (ARRAY[
    'new_lead','contacted','qualified','discovery_call','proposal','won','lost','nurture','archived'
  ]));
