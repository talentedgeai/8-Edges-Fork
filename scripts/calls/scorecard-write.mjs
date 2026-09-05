// Sales Intelligence PR 4, step 2 of the weekly scoring pass.
// Reads scored calls as JSON from stdin, upserts call_scorecards, then
// refreshes this week's "Avg sales call score" reading on the Eight Edges
// metrics table. Idempotent on re-run (upserts everywhere).
//
//   npx tsx scripts/calls/scorecard-prep.mts   # step 1: what needs scoring
//   cat scored.json | node scripts/calls/scorecard-write.mjs
//
// Expected stdin shape, one entry per call:
// [{ call_transcript_id, talk_ratio, question_count,
//    score_talk_ratio, score_pain_quantified, score_product_fit,
//    score_objection_surfaced, score_next_step, coaching_md }]
import fs from 'node:fs';
import { sql } from '../crm/db.mjs';

const DAVE_PERSON_ID = 'a8bf026f-8c20-49c5-8a55-6fc5c580af64';
const METRIC_NAME = 'Avg sales call score';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));

if (!Array.isArray(input) || input.length === 0) {
  console.log('nothing to write');
  process.exit(0);
}

for (const s of input) {
  await sql`
    insert into company_os.call_scorecards
      (call_transcript_id, talk_ratio, question_count, score_talk_ratio, score_pain_quantified,
       score_product_fit, score_objection_surfaced, score_next_step, coaching_md, scored_by, scored_at)
    values
      (${s.call_transcript_id}, ${s.talk_ratio}, ${s.question_count}, ${s.score_talk_ratio},
       ${s.score_pain_quantified}, ${s.score_product_fit}, ${s.score_objection_surfaced},
       ${s.score_next_step}, ${s.coaching_md}, 'agent', now())
    on conflict (call_transcript_id) do update set
      talk_ratio = excluded.talk_ratio,
      question_count = excluded.question_count,
      score_talk_ratio = excluded.score_talk_ratio,
      score_pain_quantified = excluded.score_pain_quantified,
      score_product_fit = excluded.score_product_fit,
      score_objection_surfaced = excluded.score_objection_surfaced,
      score_next_step = excluded.score_next_step,
      coaching_md = excluded.coaching_md,
      scored_by = 'agent', scored_at = now(), updated_at = now()`;
}
console.log(`wrote ${input.length} scorecard(s)`);

// Ensure the Eight Edges metric exists (owner rule: person or agent required).
const metric = await sql`
  insert into company_os.metrics (name, office, formula, target, direction, source, source_detail, owner_person_id, owner_agent)
  values (${METRIC_NAME}, 'revenue',
          'Mean of the five 1-5 scorecard dimensions across sales calls started this week',
          4, 'up', 'agent', 'sales-intelligence-scorecard weekly task', ${DAVE_PERSON_ID}, 'sales-intelligence-scorecard')
  on conflict (name) do update set updated_at = now()
  returning id`;

// This week's reading: average coach score over sales calls started this ISO week.
const weekStart = await sql`select date_trunc('week', now())::date as ws`;
const reading = await sql`
  select avg((coalesce(sc.score_talk_ratio,0) + coalesce(sc.score_pain_quantified,0) +
              coalesce(sc.score_product_fit,0) + coalesce(sc.score_objection_surfaced,0) +
              coalesce(sc.score_next_step,0))::numeric /
             nullif((sc.score_talk_ratio is not null)::int + (sc.score_pain_quantified is not null)::int +
                    (sc.score_product_fit is not null)::int + (sc.score_objection_surfaced is not null)::int +
                    (sc.score_next_step is not null)::int, 0)) as avg_score
  from company_os.call_scorecards sc
  join company_os.call_transcripts ct on ct.id = sc.call_transcript_id
  where ct.call_type = 'sales' and ct.started_at >= ${weekStart[0].ws}`;

if (reading[0].avg_score != null) {
  await sql`
    insert into company_os.metric_readings (metric_id, week_start, value, collected_by)
    values (${metric[0].id}, ${weekStart[0].ws}, ${Number(reading[0].avg_score).toFixed(2)}, 'sales-intelligence-scorecard')
    on conflict (metric_id, week_start) do update set value = excluded.value`;
  console.log(`metric reading for week ${weekStart[0].ws.toISOString?.().slice(0, 10) ?? weekStart[0].ws}: ${Number(reading[0].avg_score).toFixed(2)}`);
} else {
  console.log('no scored sales calls this week; no reading written');
}
await sql.end();
