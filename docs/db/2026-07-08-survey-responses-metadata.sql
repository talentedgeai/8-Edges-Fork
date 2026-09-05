-- Per-response metadata (import provenance, source system, session detail, and
-- any extra fields that aren't survey questions). Additive; the app's insert
-- path leaves it at the default '{}'. Applied via Supabase MCP on 2026-07-08.
--
-- Added to support the historical feedback import (Four Offices / AIO missions /
-- leadership sessions / AI Labs micro-sessions) into the AI Capability Pulse
-- survey: stamps source + import_id (for idempotency) + the non-question columns.
alter table company_os.survey_responses
  add column metadata jsonb not null default '{}'::jsonb;
