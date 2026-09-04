// Eight Edges: seed the 2026 strategy and the Q3 2026 goal tree.
// Content mirrors the approved prototype v2 (docs/product/eight-edges/), which
// is grounded in the real business; every row is editable from /admin/edges.
// Run from the repo root: node scripts/edges/seed-2026q3.mjs
// Refuses to run twice; pass --force to wipe the Eight Edges tables and reseed.
import { sql } from '../crm/db.mjs';

const DAVE = 'a8bf026f-8c20-49c5-8a55-6fc5c580af64'; // people.id, verified
const Q = '2026Q3';

const existing = await sql`select id from company_os.strategies where year = 2026`;
if (existing.length && !process.argv.includes('--force')) {
  console.log('2026 strategy already seeded; pass --force to wipe and reseed.');
  await sql.end();
  process.exit(0);
}
if (existing.length) {
  await sql`delete from company_os.sync_packets`;
  await sql`delete from company_os.metric_readings`;
  await sql`delete from company_os.metrics`;
  await sql`delete from company_os.issues`;
  await sql`update company_os.objectives set parent_kr_id = null`;
  await sql`delete from company_os.key_results`;
  await sql`delete from company_os.objectives`;
  await sql`delete from company_os.strategies`;
}

const [strategy] = await sql`
  insert into company_os.strategies (year, title, body_md) values (
    2026,
    'Own the staffing renewal base, make AI Programs the growth engine, and prove a company can run half human, half AI, then teach it.',
    ${'## Diagnosis\nTwo real business lines: Staffing (renewal-driven, anniversary calendar) and AI Programs (deal-driven, thought-leadership fed). The constraint is leadership capacity, not demand.\n\n## Guiding policy\nRun the company on Eight Edges: every goal cascades to an executor, human or agent; every key result carries a casting decision; agents keep the rhythm so goals cannot fade.\n\n## Coherent actions\n1. Renewals become a system (48h proposals, agent-run CRM writes).\n2. AI Programs growth via published thought leadership and a pipeline that never depends on memory.\n3. Dogfood Eight Edges, then teach it through Leadership in the AI Era.'}
  ) returning id`;
const SID = strategy.id;

async function objective(o) {
  const [row] = await sql`insert into company_os.objectives
    (strategy_id, level, office, brand, parent_kr_id, quarter, title, owner_person_id, owner_agent, sort_order)
    values (${SID}, ${o.level}, ${o.office ?? null}, ${o.line ?? null}, ${o.parent ?? null}, ${Q}, ${o.title}, ${o.owner ?? DAVE}, ${o.agent ?? null}, ${o.sort ?? 0})
    returning id`;
  return row.id;
}
async function kr(objectiveId, k, sort) {
  const [row] = await sql`insert into company_os.key_results
    (objective_id, title, target_value, current_value, unit, direction, delivery_mix, accountable_person_id, executing_agent, status, sort_order)
    values (${objectiveId}, ${k.title}, ${k.target}, ${k.current}, ${k.unit ?? null}, ${k.dir ?? 'up'}, ${k.mix}, ${DAVE}, ${k.agent ?? null}, ${k.status ?? 'on_track'}, ${sort})
    returning id`;
  return row.id;
}

// ── Company level ────────────────────────────────────────────────
const o1 = await objective({ level: 'company', line: 'edge8', title: 'Own the renewal base', sort: 1 });
const kr11 = await kr(o1, { title: 'Renew 4 of 4 staffing contracts (Unlock, On Target, EO, Wareease)', target: 4, current: 2, unit: 'contracts', mix: 'human' }, 1);
const kr12 = await kr(o1, { title: 'Staffing revenue from $34k to $42k MRR', target: 42000, current: 37500, unit: 'usd', mix: 'blended', agent: 'email-marketer' }, 2);
await kr(o1, { title: 'Renewal proposal live within 48h of trigger date', target: 100, current: 100, unit: '%', mix: 'ai', agent: 'developer' }, 3);

const o2 = await objective({ level: 'company', line: 'edge8', title: 'Make AI Programs the growth engine', sort: 2 });
const kr21 = await kr(o2, { title: 'Close 6 new AI Program deals', target: 6, current: 3, unit: 'deals', mix: 'human' }, 1);
const kr22 = await kr(o2, { title: 'Transcript-to-proposal median under 10 minutes', target: 10, current: 8, unit: 'min', dir: 'down', mix: 'ai', agent: 'developer' }, 2);
const kr23 = await kr(o2, { title: '2 keynotes or workshops booked per month', target: 2, current: 1.5, unit: 'per_month', mix: 'blended', agent: 'writer', status: 'at_risk' }, 3);

const o3 = await objective({ level: 'company', title: 'Run Edge8 on Eight Edges', sort: 3 });
const kr31 = await kr(o3, { title: '100% of weekly Syncs run on the agent-prepared packet', target: 100, current: 86, unit: '%', mix: 'blended', agent: 'product-manager' }, 1);
await kr(o3, { title: 'Every KR carries a casting decision and one accountable human', target: 100, current: 100, unit: '%', mix: 'ai', agent: 'qa' }, 2);
const kr33 = await kr(o3, { title: 'Weekly metrics 100% agent-pulled, zero manual entry', target: 100, current: 78, unit: '%', mix: 'ai', agent: 'devops', status: 'at_risk' }, 3);

// ── Office level (translation, not duplication) ──────────────────
const rev = await objective({ level: 'office', office: 'revenue', parent: kr11, title: 'Make renewals a system, not a scramble', sort: 1 });
await kr(rev, { title: 'Renewal workflow runs end-to-end for all 4 anniversaries', target: 4, current: 2, unit: 'anniversaries', mix: 'blended' }, 1);
const revKrProposal = await kr(rev, { title: 'Transcript to live proposal under 10 minutes', target: 10, current: 8, unit: 'min', dir: 'down', mix: 'ai', agent: 'developer' }, 2);

const tal = await objective({ level: 'office', office: 'talent', parent: kr12, title: 'Bench strength that makes expansion easy to say yes to', sort: 2 });
await kr(tal, { title: '3 pre-vetted candidates ready per active role family', target: 3, current: 2, unit: 'candidates', mix: 'human' }, 1);
await kr(tal, { title: 'Time-to-fill under 21 days on expansion seats', target: 21, current: 19, unit: 'days', dir: 'down', mix: 'blended' }, 2);

// ── Executor level ───────────────────────────────────────────────
const exec1 = await objective({ level: 'executor', parent: revKrProposal, title: 'Proposal generation fully agent-run', agent: 'developer', sort: 1 });
await kr(exec1, { title: 'crm-call-to-proposal executes under 10 min, 100% of runs', target: 100, current: 100, unit: '%', mix: 'ai', agent: 'developer' }, 1);
await kr(exec1, { title: 'Zero manual CRM writes for renewals this quarter', target: 0, current: 0, unit: 'manual_writes', dir: 'down', mix: 'ai', agent: 'developer' }, 2);

// ── Metrics + two weeks of readings ──────────────────────────────
async function metric(m) {
  const [row] = await sql`insert into company_os.metrics
    (name, office, formula, target, direction, source, source_detail, owner_person_id, owner_agent, key_result_id)
    values (${m.name}, ${m.office}, ${m.formula}, ${m.target}, ${m.dir ?? 'up'}, ${m.source}, ${m.detail ?? null}, ${m.agent ? null : DAVE}, ${m.agent ?? null}, ${m.kr ?? null})
    returning id`;
  return row.id;
}
const W1 = '2026-07-27', W2 = '2026-08-03';
async function readings(metricId, v1, v2, by) {
  if (v1 != null) await sql`insert into company_os.metric_readings (metric_id, week_start, value, collected_by) values (${metricId}, ${W1}, ${v1}, ${by})`;
  if (v2 != null) await sql`insert into company_os.metric_readings (metric_id, week_start, value, collected_by) values (${metricId}, ${W2}, ${v2}, ${by})`;
}

const m1 = await metric({ name: 'Staffing MRR', office: 'revenue', formula: 'sum of active staffing contracts per month', target: 42000, source: 'agent', detail: 'company_os.deals', kr: kr12 });
await readings(m1, 36700, 37500, 'seed');
const m2 = await metric({ name: 'Open AI Program deals', office: 'revenue', formula: "count(deals, status=open, category='AI Program')", target: 8, source: 'agent', detail: 'company_os.deals', kr: kr21 });
await readings(m2, 5, 5, 'seed');
const m3 = await metric({ name: 'Transcript to proposal', office: 'revenue', formula: 'median minutes per playbook run', target: 10, dir: 'down', source: 'agent', detail: 'playbook log', agent: 'developer', kr: kr22 });
await readings(m3, 9, 8, 'seed');
const m4 = await metric({ name: 'Time-to-fill', office: 'talent', formula: 'avg days, role opened to filled', target: 21, dir: 'down', source: 'agent', detail: 'company_os', kr: kr12 });
await readings(m4, 22, 19, 'seed');
const m5 = await metric({ name: 'Published pieces', office: 'innovation', formula: 'posts live per month', target: 4, source: 'agent', detail: 'site', agent: 'writer', kr: kr23 });
await readings(m5, 4, 3, 'seed');
const m6 = await metric({ name: 'Keynote pitches sent', office: 'revenue', formula: 'pitches sent per month', target: 4, source: 'manual', kr: kr23 });
await readings(m6, 2, null, 'manual:dave');
const m7 = await metric({ name: 'Sync packet on time', office: 'operations', formula: 'packet ready before Mon 08:00', target: 100, source: 'agent', detail: 'scheduler', agent: 'product-manager', kr: kr31 });
await readings(m7, 100, 86, 'seed');

// ── Issues ───────────────────────────────────────────────────────
await sql`insert into company_os.issues (title, diagnosis, key_result_id, filed_by, status, notes_md) values
  ('Keynote pipeline below 2/mo, two weeks running', 'system', ${kr23}, 'pm-agent:auto', 'open', 'No standing pitch list. Proposal: standing list plus one pitch per week cast to the email-marketer agent.'),
  ('Wareease renewal champion left the company', 'execution', ${kr11}, 'dave', 'open', 'Needs a new exec sponsor before the Jan 1 anniversary.'),
  ('KR3.3 target may be wrong: 2 sources have no API', 'goal', ${kr33}, 'devops-agent:auto', 'open', 'Two metrics have no reachable API; propose re-scoping the target at review.')`;

const counts = await sql`select
  (select count(*) from company_os.objectives) as objectives,
  (select count(*) from company_os.key_results) as key_results,
  (select count(*) from company_os.metrics) as metrics,
  (select count(*) from company_os.metric_readings) as readings,
  (select count(*) from company_os.issues) as issues`;
console.log('seeded:', counts[0]);
await sql.end();
