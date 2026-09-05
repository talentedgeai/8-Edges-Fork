// Eight Edges: the agent context feed. Prints the current goal tree as
// compact markdown, for injection into any agent's planning step.
//
//   node scripts/edges/context.mjs             # full tree
//   node scripts/edges/context.mjs --at-risk   # only at-risk / off-track KRs
//   node scripts/edges/context.mjs --office revenue
//   node scripts/edges/context.mjs --agent developer
//
// Output is deliberately under ~100 lines: this is context, not a report.
import { sql } from '../crm/db.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const atRiskOnly = args.includes('--at-risk');
const officeFilter = flag('office');
const agentFilter = flag('agent');

const now = new Date();
const quarter = `${now.getFullYear()}Q${Math.floor(now.getMonth() / 3) + 1}`;

const [strategy] = await sql`select year, title from company_os.strategies order by year desc limit 1`;
const objectives = await sql`
  select id, level, office, brand, parent_kr_id, title, owner_agent, sort_order
  from company_os.objectives where quarter = ${quarter} and status = 'active' order by sort_order`;
const krs = await sql`
  select k.*, p.full_name as accountable_name
  from company_os.key_results k
  join company_os.people p on p.id = k.accountable_person_id
  where k.objective_id in (select id from company_os.objectives where quarter = ${quarter})
  order by k.sort_order`;
const issues = await sql`
  select title, diagnosis, filed_by from company_os.issues where status in ('open','solving') order by created_at`;

const krsByObjective = new Map();
for (const k of krs) {
  if (!krsByObjective.has(k.objective_id)) krsByObjective.set(k.objective_id, []);
  krsByObjective.get(k.objective_id).push(k);
}
const childrenByKr = new Map();
for (const o of objectives) {
  if (!o.parent_kr_id) continue;
  if (!childrenByKr.has(o.parent_kr_id)) childrenByKr.set(o.parent_kr_id, []);
  childrenByKr.get(o.parent_kr_id).push(o);
}

const fmt = (k) => {
  const target = k.target_value == null ? '' : ` (now ${k.current_value}, target ${k.direction === 'down' ? '<=' : ''}${k.target_value}${k.unit ? ' ' + k.unit : ''})`;
  const mix = k.delivery_mix === 'ai' ? 'AI-led' : k.delivery_mix === 'blended' ? 'blended' : 'human-led';
  const agent = k.executing_agent ? `, ${k.executing_agent} agent executes` : '';
  const risk = k.status === 'at_risk' ? ' [AT RISK]' : k.status === 'off_track' ? ' [OFF TRACK]' : k.status === 'done' ? ' [done]' : '';
  return `${k.title}${target} · ${mix}${agent}, ${k.accountable_name.split(' ')[0]} accountable${risk}`;
};

const keepKr = (k) => {
  if (atRiskOnly && k.status !== 'at_risk' && k.status !== 'off_track') return false;
  if (agentFilter && k.executing_agent !== agentFilter) return false;
  return true;
};
const keepObjective = (o) => !officeFilter || o.level !== 'office' || o.office === officeFilter;

const lines = [];
lines.push(`# Eight Edges context · ${quarter}`);
if (strategy) lines.push(`Strategy ${strategy.year}: ${strategy.title}`);
lines.push('');

function render(o, depth) {
  if (!keepObjective(o)) return;
  const pad = '  '.repeat(depth);
  const scope = o.level === 'company' ? (o.brand ?? 'company-wide') : o.level === 'office' ? `office of ${o.office}` : `executor${o.owner_agent ? ': ' + o.owner_agent + ' agent' : ''}`;
  const myKrs = (krsByObjective.get(o.id) ?? []).filter(keepKr);
  const childLines = [];
  for (const k of krsByObjective.get(o.id) ?? []) {
    for (const child of childrenByKr.get(k.id) ?? []) childLines.push([child, k]);
  }
  if (myKrs.length === 0 && childLines.length === 0 && (atRiskOnly || agentFilter)) return;
  lines.push(`${pad}- O (${scope}): ${o.title}`);
  for (const k of myKrs) lines.push(`${pad}  - KR: ${fmt(k)}`);
  for (const [child] of childLines) render(child, depth + 1);
}
for (const o of objectives.filter((x) => x.level === 'company')) render(o, 0);

if (issues.length && !agentFilter) {
  lines.push('');
  lines.push('Open issues:');
  for (const i of issues) lines.push(`- [${i.diagnosis}] ${i.title} (filed by ${i.filed_by})`);
}
lines.push('');
lines.push('Rule: every planned work item should name the KR it advances, or say "no KR" explicitly.');

console.log(lines.join('\n'));
await sql.end();
