-- Rich event content: ordered media gallery + public storage bucket.
-- Design: docs/plans/2026-07-11-event-management-design.md (content follow-up).
-- Additive only.

-- Ordered gallery: [{"kind":"image"|"video","url":"https://...","caption":"..."}]
-- Images live in the event-media bucket (uploaded via admin); videos are
-- external URLs (YouTube/Vimeo/direct file) embedded by the public page.
alter table company_os.events
  add column if not exists media jsonb not null default '[]'::jsonb;

-- Public bucket for event images (cover + gallery). Reads are public via the
-- bucket flag; writes only happen server-side through the service client
-- (admin-gated upload action), so no storage RLS policies are added.
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;
