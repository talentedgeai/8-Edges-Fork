-- Did the 2026-08-29 model re-tier (b3080f7b) degrade the AI surfaces?
--
-- Splits every AI-stamped table before/after the re-tier commit and reports
-- volume, failure rate, and which model produced each cohort.
--
-- Caveat on the era split: rows are bucketed by when the AI last WROTE them
-- (updated_at / ai_screened_at), not when the row was created. A row
-- regenerated after the cutoff counts as "after" even if it was first
-- summarized under Opus. That is the right bucketing for "which model produced
-- what is on screen today", and the ai_model column confirms it per group.

-- ── 1. Failure rate by surface, era, and model ───────────────────────────────
with cutoff as (select timestamptz '2026-08-29 12:35:52+07' as at)

select 'meeting-summary' as surface,
       case when m.updated_at < c.at then 'before' else 'after' end as era,
       coalesce(m.ai_model, '(none)') as ai_model,
       count(*) as n,
       count(*) filter (where m.ai_status = 'failed') as failed,
       round(100.0 * count(*) filter (where m.ai_status = 'failed')
             / nullif(count(*), 0), 1) as failed_pct
from company_os.meetings m cross join cutoff c
where m.ai_status is not null
  and m.updated_at > c.at - interval '90 days'
group by 1, 2, 3

union all

select 'idea-plan',
       case when i.updated_at < c.at then 'before' else 'after' end,
       coalesce(i.ai_model, '(none)'),
       count(*),
       count(*) filter (where i.ai_error is not null),
       round(100.0 * count(*) filter (where i.ai_error is not null)
             / nullif(count(*), 0), 1)
from company_os.ideas i cross join cutoff c
where i.updated_at > c.at - interval '90 days'
group by 1, 2, 3

union all

select 'resume-screen',
       case when a.ai_screened_at < c.at then 'before' else 'after' end,
       coalesce(a.ai_model, '(none)'),
       count(*),
       count(*) filter (where a.ai_screen_status = 'failed'),
       round(100.0 * count(*) filter (where a.ai_screen_status = 'failed')
             / nullif(count(*), 0), 1)
from company_os.applications a cross join cutoff c
where a.ai_screened_at is not null
  and a.ai_screened_at > c.at - interval '90 days'
group by 1, 2, 3

union all

select 'coaching-summary',
       case when o.updated_at < c.at then 'before' else 'after' end,
       coalesce(o.ai_model, '(none)'),
       count(*),
       count(*) filter (where o.ai_error is not null),
       round(100.0 * count(*) filter (where o.ai_error is not null)
             / nullif(count(*), 0), 1)
from company_os.coaching_one_on_ones o cross join cutoff c
where o.archived_at is null
  and o.updated_at > c.at - interval '90 days'
group by 1, 2, 3

order by surface, era desc, ai_model;


-- ── 2. What the failures actually say ────────────────────────────────────────
-- A truncated-JSON failure (the max_tokens bug) shows up here as a
-- "Unexpected end of JSON input" / SyntaxError. A genuine outage shows as an
-- API status error. These read very differently — that is the point.

select 'meetings' as tbl, ai_model, ai_error, count(*) as n
from company_os.meetings
where ai_error is not null and updated_at > timestamptz '2026-08-01'
group by 1, 2, 3
union all
select 'ideas', ai_model, ai_error, count(*)
from company_os.ideas
where ai_error is not null and updated_at > timestamptz '2026-08-01'
group by 1, 2, 3
union all
select 'applications', ai_model, ai_screen_error, count(*)
from company_os.applications
where ai_screen_error is not null and ai_screened_at > timestamptz '2026-08-01'
group by 1, 2, 3
union all
select 'coaching_one_on_ones', ai_model, ai_error, count(*)
from company_os.coaching_one_on_ones
where ai_error is not null and updated_at > timestamptz '2026-08-01'
group by 1, 2, 3
order by n desc;


-- ── 3. Quality proxy: did the screen's scoring distribution shift? ───────────
-- resume-screen went Opus 4.8 -> Sonnet 5 @ effort medium. If Sonnet is
-- scoring candidates systematically higher or flatter (lower spread), the
-- shortlist changed shape even though nothing "failed".

select case when ai_screened_at < timestamptz '2026-08-29 12:35:52+07'
            then 'before' else 'after' end as era,
       ai_model,
       count(*) as n,
       round(avg(ai_rating), 2) as avg_rating,
       round(stddev_pop(ai_rating), 2) as spread,
       count(*) filter (where ai_rating >= 4) as rated_4_plus,
       round(100.0 * count(*) filter (where ai_rating >= 4)
             / nullif(count(*), 0), 1) as pct_4_plus
from company_os.applications
where ai_rating is not null
  and ai_screened_at > timestamptz '2026-06-01'
group by 1, 2
order by era desc, ai_model;
