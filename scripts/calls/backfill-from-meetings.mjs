// Sales Intelligence PR 1: copy the transcripts already stashed in
// meetings.metadata.transcript into company_os.call_transcripts.
// Run from the repo root: node scripts/calls/backfill-from-meetings.mjs
// Idempotent: upserts by meeting_id, safe to re-run.
import { sql } from '../crm/db.mjs';

const rows = await sql`
  select id, title, started_at, duration_seconds,
         metadata ->> 'transcript' as transcript,
         metadata ->> 'minute_token' as minute_token,
         metadata ->> 'source' as source
  from company_os.meetings
  where metadata ->> 'transcript' is not null`;

// Sales calls mention "Discovery" in the title by convention; everything else
// from these sources is a client sync.
const callType = (title) => (/discovery/i.test(title) ? 'sales' : 'client');

let inserted = 0;
for (const r of rows) {
  const res = await sql`
    insert into company_os.call_transcripts
      (minute_token, meeting_id, title, started_at, duration_seconds, source, call_type, transcript)
    values
      (${r.minute_token}, ${r.id}, ${r.title}, ${r.started_at}, ${r.duration_seconds},
       ${r.source ?? 'unknown'}, ${callType(r.title)}, ${r.transcript})
    on conflict (meeting_id) do update set
      transcript = excluded.transcript,
      minute_token = coalesce(company_os.call_transcripts.minute_token, excluded.minute_token),
      updated_at = now()
    returning (xmax = 0) as is_insert`;
  if (res[0]?.is_insert) inserted += 1;
}

console.log(`${rows.length} meetings with transcripts; ${inserted} new call_transcripts rows`);
await sql.end();
