// Sales Intelligence PR 2: pull recorded calls from Lark Minutes into
// company_os.call_transcripts. Runs on the Mac Mini only (lark-cli holds
// Dave's user auth there; prod has no Lark credentials).
//
//   node scripts/calls/sync-lark-minutes.mjs                 # last 2 days
//   node scripts/calls/sync-lark-minutes.mjs 2026-07-01 2026-07-31   # backfill a range (max 1 month)
//
// Idempotent: skips minute_tokens already stored, upserts on conflict.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { sql } from '../crm/db.mjs';

const LARK_TZ = '+08:00'; // Lark tenant timezone (edge8company.sg); transcript headers use it
const env = { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' };
const lark = (args) => JSON.parse(execFileSync('lark-cli', [...args, '--as', 'user', '--format', 'json'], { env, encoding: 'utf8' }));

const day = (d) => d.toISOString().slice(0, 10);
const start = process.argv[2] ?? day(new Date(Date.now() - 2 * 86400_000));
const end = process.argv[3] ?? day(new Date());

const classify = (title) => {
  if (/discovery/i.test(title)) return 'sales';
  if (/1-1|1:1|sprint|leadership|standup|all hands|partner meeting/i.test(title)) return 'internal';
  if (/sync|roadmap|onboarding|<>/i.test(title)) return 'client';
  return 'other';
};

// Search my minutes in the window, both roles, deduped by token.
const items = new Map();
for (const flag of ['--owner-ids', '--participant-ids']) {
  let pageToken;
  do {
    const args = ['minutes', '+search', flag, 'me', '--start', start, '--end', end, '--page-size', '30'];
    if (pageToken) args.push('--page-token', pageToken);
    const res = lark(args);
    for (const it of res.data.items ?? []) items.set(it.token, it);
    pageToken = res.data.has_more ? res.data.page_token : undefined;
  } while (pageToken);
}

const known = new Set(
  (await sql`select minute_token from company_os.call_transcripts where minute_token is not null`)
    .map((r) => r.minute_token),
);
const fresh = [...items.keys()].filter((t) => !known.has(t));
console.log(`${start}..${end}: ${items.size} minutes found, ${fresh.length} new`);

let stored = 0;
for (const token of fresh) {
  const detail = lark(['minutes', '+detail', '--minute-tokens', token, '--transcript']);
  const m = detail.data.minutes?.[0];
  const file = m?.artifacts?.transcript_file;
  if (!file || !fs.existsSync(file)) {
    console.log(`skip ${token}: no transcript (still processing, or too short)`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (text.length < 500) {
    console.log(`skip ${token}: transcript too short (${text.length} chars, likely an aborted recording)`);
    continue;
  }

  // Header line: "2026-08-14 06:58:55 CST|38min" or "...|1h 13min 52s"
  const head = text.slice(0, 200).match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})[^|]*\|\s*([^\n]*)/);
  const startedAt = head ? new Date(`${head[1].replace(' ', 'T')}${LARK_TZ}`) : null;
  let durationSeconds = null;
  if (head) {
    const d = head[2].match(/(?:(\d+)\s*h(?:r)?)?\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*s)?/);
    durationSeconds = (+d[1] || 0) * 3600 + (+d[2] || 0) * 60 + (+d[3] || 0) || null;
  }

  // Link to an existing meetings row: by minute_token first, then by title on the same day.
  const meeting = await sql`
    select id from company_os.meetings
    where (metadata ->> 'minute_token' = ${token}
       or (${startedAt}::timestamptz is not null
           and lower(title) = lower(${m.title})
           and started_at::date = (${startedAt}::timestamptz)::date))
      and id not in (select meeting_id from company_os.call_transcripts where meeting_id is not null)
    limit 1`;

  await sql`
    insert into company_os.call_transcripts
      (minute_token, meeting_id, title, started_at, duration_seconds, source, call_type, transcript)
    values
      (${token}, ${meeting[0]?.id ?? null}, ${m.title}, ${startedAt}, ${durationSeconds},
       'lark_minutes', ${classify(m.title)}, ${text})
    on conflict (minute_token) do update set
      transcript = excluded.transcript, updated_at = now()`;
  stored += 1;
  console.log(`stored ${m.title} (${token})`);
}

fs.rmSync('minutes', { recursive: true, force: true }); // lark-cli's transcript download dir
console.log(`done: ${stored} stored`);
await sql.end();
