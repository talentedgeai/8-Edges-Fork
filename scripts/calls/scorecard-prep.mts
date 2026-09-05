// Sales Intelligence PR 4, step 1 of the weekly scoring pass.
// Lists every SALES call without a scorecard, computes the deterministic
// measures, and dumps each transcript to .scorecard-work/<id>.txt for the
// scoring agent to read. Prints one JSON array on stdout.
// Run from the repo root: npx tsx scripts/calls/scorecard-prep.mts
import fs from "node:fs";
import { analyzeCall } from "../../entities/company-os/modules/crm/call-analysis";
import { sql } from "../crm/db.mjs";

type CallRow = { id: string; title: string; started_at: Date | null; duration_seconds: number | null; transcript: string };

const rows = await sql<CallRow[]>`
  select ct.id, ct.title, ct.started_at, ct.duration_seconds, ct.transcript
  from company_os.call_transcripts ct
  left join company_os.call_scorecards sc on sc.call_transcript_id = ct.id
  where ct.call_type = 'sales' and sc.id is null
  order by ct.started_at`;

fs.mkdirSync(".scorecard-work", { recursive: true });
const out = rows.map((r) => {
  const stats = analyzeCall(r.transcript);
  const file = `.scorecard-work/${r.id}.txt`;
  fs.writeFileSync(file, r.transcript);
  return {
    call_transcript_id: r.id,
    title: r.title,
    started_at: r.started_at,
    duration_seconds: r.duration_seconds,
    talk_ratio: stats.talkRatio == null ? null : Number(stats.talkRatio.toFixed(3)),
    question_count: stats.questionCount,
    transcript_file: file,
  };
});

console.log(JSON.stringify(out, null, 2));
await sql.end();
