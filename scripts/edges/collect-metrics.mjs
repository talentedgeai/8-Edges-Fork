// Eight Edges: the Monday 06:00 metrics collector + issue watcher (PR 5).
// Pulls every weekly number that has a source this machine can reach exactly,
// writes it to company_os.metric_readings, and files an issue when a number
// has missed its target two weeks running with no open issue about it.
// Numbers without an exact source are left alone (they stay manual on the
// Metrics page, labeled honestly).
// Run from the repo root: node scripts/edges/collect-metrics.mjs
import { sql } from '../crm/db.mjs';

const now = new Date();
const day = (now.getDay() + 6) % 7;
const monday = new Date(now);
monday.setDate(now.getDate() - day);
const WEEK = monday.toISOString().slice(0, 10);
const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

const DAVE_PERSON_ID = 'a8bf026f-8c20-49c5-8a55-6fc5c580af64';

// ── Year-goal metrics this collector owns. Cumulative year-to-date numbers
// measured against an annual target, so the two-week issue watcher skips them
// (being under an annual target mid-year is the expected shape, not a miss).
const YEAR_GOALS = [
  {
    name: 'Keynote attendees',
    office: 'revenue',
    formula: 'Year-to-date attendees across live events (company_os.workshop_attendees_total, same number as the edge8.ai homepage)',
    target: 1000,
  },
  {
    name: 'Documented workflows',
    office: 'innovation',
    formula: 'Public /workflows directory + private library workflow entries (all brands) + docs published to Storage, as computed by edge8.ai/api/stats',
    target: 100,
  },
];
const YEAR_GOAL_NAMES = new Set(YEAR_GOALS.map((g) => g.name));
for (const g of YEAR_GOALS) {
  await sql`insert into company_os.metrics (name, office, formula, target, direction, source, source_detail, owner_person_id, owner_agent)
    values (${g.name}, ${g.office}, ${g.formula}, ${g.target}, 'up', 'agent', 'edges Monday collector (collect-metrics.mjs)', ${DAVE_PERSON_ID}, 'devops-agent')
    on conflict (name) do update set formula = excluded.formula, target = excluded.target, updated_at = now()`;
}

// ── Collectors, keyed by metrics.name. Each returns a number or null (skip). ──
const collectors = {
  'Open AI Program deals': async () => {
    const [r] = await sql`select count(*)::int as n from company_os.deals
      where status = 'open' and metadata->'categories' @> '[{"name":"AI Program"}]'::jsonb`;
    return r.n;
  },
  'Sync packet on time': async () => {
    const [r] = await sql`select count(*)::int as n from company_os.sync_packets
      where week_start >= ${quarterStart.toISOString().slice(0, 10)}`;
    const weeksElapsed = Math.max(1, Math.ceil(((now - quarterStart) / 86400000 + 1) / 7));
    if (r.n === 0) return null; // packet generation not live yet; skip rather than report 0
    return Math.round((r.n / weeksElapsed) * 100);
  },
  'Keynote attendees': async () => {
    const [r] = await sql`select company_os.workshop_attendees_total(${now.getFullYear()}) as n`;
    return r.n;
  },
  'Documented workflows': async () => {
    // The site computes this (public directory + private library + Storage
    // docs); asking it keeps one source of truth. Null on failure = skip week.
    const res = await fetch('https://www.edge8.ai/api/stats').catch(() => null);
    if (!res?.ok) return null;
    const d = await res.json();
    return typeof d.documentedWorkflows === 'number' && d.documentedWorkflows > 0
      ? d.documentedWorkflows
      : null;
  },
  // Published pieces has no reliable source yet: blog frontmatter dates are
  // year-only strings. It stays manual until the site exposes real dates.
};

const metrics = await sql`select id, name, office, target, direction, source, key_result_id, owner_person_id from company_os.metrics`;

const collected = [];
const skipped = [];
for (const m of metrics) {
  const fn = collectors[m.name];
  if (!fn) {
    if (m.source === 'agent') skipped.push(`${m.name}: agent-sourced but no collector on this machine yet`);
    continue;
  }
  const value = await fn();
  if (value == null) {
    skipped.push(`${m.name}: source not ready, left alone`);
    continue;
  }
  await sql`insert into company_os.metric_readings (metric_id, week_start, value, collected_by)
    values (${m.id}, ${WEEK}, ${value}, 'devops-agent')
    on conflict (metric_id, week_start) do update set value = ${value}, collected_by = 'devops-agent'`;
  collected.push(`${m.name} = ${value}`);
}

// ── Issue watcher: two consecutive missed weeks and no open issue → file one. ──
const filed = [];
for (const m of metrics) {
  if (m.target == null) continue;
  if (YEAR_GOAL_NAMES.has(m.name)) continue; // annual targets: under mid-year is not a miss
  const readings = await sql`select value from company_os.metric_readings
    where metric_id = ${m.id} order by week_start desc limit 2`;
  if (readings.length < 2) continue;
  const miss = (v) => (m.direction === 'down' ? Number(v) > Number(m.target) : Number(v) < Number(m.target));
  if (!(miss(readings[0].value) && miss(readings[1].value))) continue;

  const [existing] = await sql`select id from company_os.issues
    where status in ('open','solving') and (title ilike ${'%' + m.name + '%'}
      or (key_result_id is not null and key_result_id = ${m.key_result_id}))
    limit 1`;
  if (existing) continue;

  // Assigned to the metric's owning person; agent-owned metrics fall to Dave.
  const DAVE = 'a8bf026f-8c20-49c5-8a55-6fc5c580af64';
  await sql`insert into company_os.issues (title, diagnosis, key_result_id, filed_by, assignee_person_id, notes_md) values (
    ${`${m.name} missed target two weeks running (${readings[1].value} then ${readings[0].value} vs ${m.target})`},
    'system',
    ${m.key_result_id},
    'devops-agent:auto',
    ${m.owner_person_id ?? DAVE},
    ${'Auto-filed by the Monday collector. First-pass diagnosis: system. Reclassify to goal (target wrong) or execution (work slipped) at the sync if the evidence says so.'}
  )`;
  filed.push(m.name);
}

console.log(`week ${WEEK}`);
console.log(`collected: ${collected.length ? collected.join('; ') : 'nothing'}`);
if (skipped.length) console.log(`skipped: ${skipped.join('; ')}`);
console.log(`issues filed: ${filed.length ? filed.join('; ') : 'none'}`);
await sql.end();
