-- Events core schema (PR 1 of the event management system).
-- Design: docs/plans/2026-07-11-event-management-design.md
-- Build plan: docs/plans/2026-07-11-event-management-build-plan.md
--
-- Additive only. Promotes the event to a first-class row; existing products
-- (type='event') become its ticket tiers via event_id, and event_registrations
-- gains the full registration/ticket/attendance lifecycle. cohort_slug on
-- products is left untouched forever (caio-coach mirror reads it), and the
-- public_retreats view stays until the admin Events hub (PR 2) replaces it.
-- Survey tables are not touched.

-- ---------------------------------------------------------------------------
-- 1. events — one row per event of any type
-- ---------------------------------------------------------------------------

create table if not exists company_os.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type text not null check (type in
    ('retreat','workshop','webinar','micro_session','dinner','private_trip','company_event')),
  status text not null default 'draft' check (status in
    ('draft','published','open','closed','completed','cancelled')),
  visibility text not null default 'public' check (visibility in
    ('public','private','internal')),
  title text not null,
  blurb text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  capacity integer,
  cover_image_url text,
  owner_person_id uuid references company_os.people(id) on delete set null,
  landing_path text,
  feedback_survey_id uuid references company_os.surveys(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table company_os.events enable row level security;

drop trigger if exists set_events_updated_at on company_os.events;
create trigger set_events_updated_at
  before update on company_os.events
  for each row execute function company_os.handle_updated_at();

create index if not exists events_status_starts_idx
  on company_os.events(status, starts_at);
create index if not exists events_type_idx on company_os.events(type);

-- ---------------------------------------------------------------------------
-- 2. products — event tiers (products already carry description/capacity/
--    tier/amount_cents; they only need the parent link and a display order)
-- ---------------------------------------------------------------------------

alter table company_os.products
  add column if not exists event_id uuid references company_os.events(id) on delete set null;
alter table company_os.products
  add column if not exists sort_order integer not null default 0;

create index if not exists products_event_idx on company_os.products(event_id);

-- ---------------------------------------------------------------------------
-- 3. event_registrations — full lifecycle + every registration is a ticket
-- ---------------------------------------------------------------------------

alter table company_os.event_registrations
  add column if not exists event_id uuid references company_os.events(id) on delete set null;
alter table company_os.event_registrations
  add column if not exists guest_count integer not null default 0;
alter table company_os.event_registrations
  add column if not exists waitlist_position integer;
alter table company_os.event_registrations
  add column if not exists ticket_code text;
alter table company_os.event_registrations
  add column if not exists checked_in_at timestamptz;
alter table company_os.event_registrations
  add column if not exists confirmation_sent_at timestamptz;
alter table company_os.event_registrations
  add column if not exists cancelled_at timestamptz;
alter table company_os.event_registrations
  add column if not exists notes text;

create unique index if not exists event_registrations_ticket_code_key
  on company_os.event_registrations(ticket_code);
create index if not exists event_registrations_event_idx
  on company_os.event_registrations(event_id, status);

-- Widen the status set. Strictly a superset: live data holds
-- confirmed/refunded rows, which stay valid; app code reads legacy
-- 'confirmed' as 'registered' and never rewrites it.
alter table company_os.event_registrations
  drop constraint if exists event_registrations_status_check;
alter table company_os.event_registrations
  add constraint event_registrations_status_check check (status in
    ('confirmed','refunded',
     'pending_payment','registered','waitlisted','cancelled','attended','no_show'));

-- ---------------------------------------------------------------------------
-- 4. Ticket codes — Crockford base32 (no I/L/O/U), 12 chars = 60 bits.
--    gen_random_bytes is crypto-strong (pgcrypto, installed); 256 % 32 = 0 so
--    byte % 32 has no modulo bias.
-- ---------------------------------------------------------------------------

-- citext and pgcrypto live in the `extensions` schema on Supabase, so both
-- functions pin it into search_path (::citext / gen_random_bytes fail to
-- resolve otherwise — caught by the post-apply RPC smoke test).
create or replace function company_os.new_ticket_code(len integer default 12)
returns text
language plpgsql
volatile
set search_path = company_os, extensions, pg_catalog
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := gen_random_bytes(len);
  code text := '';
  i integer;
begin
  for i in 0 .. len - 1 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

revoke execute on function company_os.new_ticket_code(integer) from public;
grant execute on function company_os.new_ticket_code(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. register_for_event — atomic seat reservation.
--    Locks the event row, counts held seats as sum(1 + guest_count) over
--    pending_payment/registered/attended (+ legacy confirmed), checks the
--    chosen tier's own capacity, and inserts in one transaction. Full event
--    => waitlisted with a position. Ported from eo-vietnam including its
--    guest-count bug fix.
-- ---------------------------------------------------------------------------

create or replace function company_os.register_for_event(
  p_event_id uuid,
  p_person_id uuid,
  p_product_id uuid default null,
  p_attendee_name text default null,
  p_attendee_email text default null,
  p_guest_count integer default 0,
  p_hold_for_payment boolean default false,
  p_order_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = company_os, extensions, pg_catalog
as $$
declare
  ev record;
  existing record;
  guests integer := greatest(coalesce(p_guest_count, 0), 0);
  held_statuses constant text[] := array['pending_payment','registered','attended','confirmed'];
  tier_cap integer;
  tier_held integer;
  event_held integer;
  new_status text;
  new_position integer;
  code text;
  reg_id uuid;
begin
  select * into ev from company_os.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if ev.status <> 'open' then
    raise exception 'event_not_open' using errcode = 'P0001';
  end if;

  -- Idempotency: an active registration for the same person + attendee email
  -- on this event is returned as-is rather than duplicated.
  select id, status, waitlist_position, ticket_code into existing
  from company_os.event_registrations
  where event_id = p_event_id
    and person_id = p_person_id
    and attendee_email is not distinct from p_attendee_email::citext
    and status = any (held_statuses || array['waitlisted'])
  limit 1;
  if found then
    return jsonb_build_object(
      'registration_id', existing.id,
      'status', existing.status,
      'waitlist_position', existing.waitlist_position,
      'ticket_code', existing.ticket_code,
      'already_registered', true
    );
  end if;

  -- Tier capacity (products.capacity is the per-tier cap when set).
  if p_product_id is not null then
    select capacity into tier_cap
    from company_os.products
    where id = p_product_id
      and (event_id = p_event_id or event_id is null);
    if not found then
      raise exception 'product_not_for_event' using errcode = 'P0001';
    end if;
    if tier_cap is not null then
      select coalesce(sum(1 + guest_count), 0) into tier_held
      from company_os.event_registrations
      where product_id = p_product_id and status = any (held_statuses);
      if tier_held + 1 + guests > tier_cap then
        raise exception 'tier_full' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Event capacity: full => waitlist.
  new_status := case when p_hold_for_payment then 'pending_payment' else 'registered' end;
  if ev.capacity is not null then
    select coalesce(sum(1 + guest_count), 0) into event_held
    from company_os.event_registrations
    where event_id = p_event_id and status = any (held_statuses);
    if event_held + 1 + guests > ev.capacity then
      new_status := 'waitlisted';
      select coalesce(max(waitlist_position), 0) + 1 into new_position
      from company_os.event_registrations
      where event_id = p_event_id and status = 'waitlisted';
    end if;
  end if;

  code := company_os.new_ticket_code();
  insert into company_os.event_registrations
    (event_id, product_id, order_id, person_id, attendee_name, attendee_email,
     status, guest_count, waitlist_position, ticket_code)
  values
    (p_event_id, p_product_id, p_order_id, p_person_id, p_attendee_name,
     p_attendee_email::citext, new_status, guests, new_position, code)
  returning id into reg_id;

  return jsonb_build_object(
    'registration_id', reg_id,
    'status', new_status,
    'waitlist_position', new_position,
    'ticket_code', code,
    'already_registered', false
  );
end;
$$;

revoke execute on function company_os.register_for_event(
  uuid, uuid, uuid, text, text, integer, boolean, uuid) from public;
grant execute on function company_os.register_for_event(
  uuid, uuid, uuid, text, text, integer, boolean, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Grants (views/tables never inherit; delete is the known gotcha)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on company_os.events to service_role;

-- ---------------------------------------------------------------------------
-- 7. Backfill — one event per existing retreat cohort. Idempotent:
--    on-conflict-do-nothing on slug, and the updates only fill nulls.
--    All existing cohorts are retreats (Dave: retreats are the focus);
--    type/title are admin-editable after PR 2 if any need adjusting.
--    Note: the saigon-2026-06-20 survey cohort has no products rows (predates
--    the catalog), so no event is created for it here.
-- ---------------------------------------------------------------------------

insert into company_os.events
  (slug, type, status, visibility, title, location, starts_at, ends_at, timezone, capacity, metadata)
select
  p.cohort_slug,
  'retreat',
  case
    when max(p.date_end) < now() then 'completed'
    when bool_or(p.active) then 'open'
    else 'closed'
  end,
  'public',
  coalesce(
    nullif(btrim(split_part(min(p.location), ',', 1)), ''),
    initcap(replace(p.cohort_slug, '-', ' '))
  ) || ' Retreat, ' || to_char(min(p.date_start) at time zone 'Asia/Ho_Chi_Minh', 'Mon FMDD YYYY'),
  min(p.location),
  min(p.date_start),
  max(p.date_end),
  case
    when min(p.location) ilike '%melbourne%' then 'Australia/Melbourne'
    when min(p.location) ilike '%sydney%' then 'Australia/Sydney'
    else 'Asia/Ho_Chi_Minh'
  end,
  max(p.capacity),
  jsonb_build_object('backfill', '20260711120000_events_core')
from company_os.products p
where p.type = 'event' and p.cohort_slug is not null
group by p.cohort_slug
on conflict (slug) do nothing;

update company_os.products p
set event_id = e.id
from company_os.events e
where p.type = 'event' and p.cohort_slug = e.slug and p.event_id is null;

update company_os.event_registrations r
set event_id = p.event_id
from company_os.products p
where r.product_id = p.id and r.event_id is null and p.event_id is not null;

update company_os.event_registrations
set ticket_code = company_os.new_ticket_code()
where ticket_code is null;
