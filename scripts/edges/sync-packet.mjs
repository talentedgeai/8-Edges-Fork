// Eight Edges: the Sunday 18:00 sync packet generator (PR 6).
// Assembles Monday's sync packet from the live tree, the week's readings, and
// the open issues, then stores it in company_os.sync_packets. Deterministic:
// it reports what the data says; judgment happens in the meeting.
// Run from the repo root: node scripts/edges/sync-packet.mjs
import { sql } from '../crm/db.mjs';

const now = new Date();
// The Monday this packet serves: tomorrow if today is Sunday, else next Monday.
const daysToMonday = (8 - now.getDay()) % 7 || 7;
const monday = new Date(now);
monday.setDate(now.getDate() + daysToMonday);
const WEEK = monday.toISOString().slice(0, 10);
const quarter = `${monday.getFullYear()}Q${Math.floor(monday.getMonth() / 3) + 1}`;

const metrics = await sql`select id, name, target, direction from company_os.metrics order by office, name`;
const readings = await sql`select metric_id, week_start, value, collected_by from company_os.metric_readings order by week_start desc`;
const krs = await sql`
  select k.title, k.status, k.current_value, k.target_value, k.unit, k.direction, k.delivery_mix
  from company_os.key_results k
  join company_os.objectives o on o.id = k.objective_id
  where o.quarter = ${quarter} and o.status = 'active'`;
const issues = await sql`select title, diagnosis, filed_by, created_at, notes_md from company_os.issues
  where status in ('open','solving') order by created_at asc`;

const lines = [];
lines.push(`## 1 · Numbers (5 min)`);
for (const m of metrics) {
  const mine = readings.filter((r) => r.metric_id === m.id);
  if (!mine.length) continue;
  const latest = Number(mine[0].value);
  const prev = mine[1] != null ? Number(mine[1].value) : null;
  const onTarget = m.target == null ? null : m.direction === 'down' ? latest <= Number(m.target) : latest >= Number(m.target);
  const trend = prev == null ? '' : latest === prev ? ', flat' : latest > prev ? `, up from ${prev}` : `, down from ${prev}`;
  const verdict = onTarget == null ? '' : onTarget ? ' (on target)' : ` (target ${m.target})`;
  lines.push(`- ${m.name}: ${latest}${trend}${verdict}`);
}

lines.push('');
lines.push(`## 2 · Goals check (10 min)`);
const onTrack = krs.filter((k) => k.status === 'on_track' || k.status === 'done').length;
lines.push(`- ${onTrack} of ${krs.length} key results on track.`);
for (const k of krs.filter((x) => x.status === 'at_risk' || x.status === 'off_track')) {
  lines.push(`- AT RISK: ${k.title} (now ${k.current_value}, target ${k.direction === 'down' ? '<=' : ''}${k.target_value ?? '?'}${k.unit ? ' ' + k.unit : ''}, ${k.delivery_mix}-delivered).`);
}

lines.push('');
lines.push(`## 3 · Solve issues (40 min, oldest impact first)`);
if (!issues.length) lines.push('- No open issues. Use the time on the at-risk key results.');
issues.forEach((i, idx) => {
  const age = Math.floor((now - new Date(i.created_at)) / 86400000);
  lines.push(`- ${idx === 0 ? 'FIRST: ' : ''}[${i.diagnosis}] ${i.title} (${age}d old, filed by ${i.filed_by})${i.notes_md ? ` · ${i.notes_md}` : ''}`);
});

lines.push('');
lines.push(`## Commitments out`);
lines.push('- Capture every commitment as a task with an owner; check them at next sync.');

const body = lines.join('\n');
await sql`insert into company_os.sync_packets (week_start, body_md, created_by)
  values (${WEEK}, ${body}, 'product-manager-agent')
  on conflict (week_start) do update set body_md = ${body}, created_by = 'product-manager-agent', created_at = now()`;

console.log(`packet stored for sync of ${WEEK} (${body.length} chars)`);
console.log(body);
await sql.end();
