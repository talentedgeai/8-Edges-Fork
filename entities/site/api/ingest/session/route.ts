import { NextResponse } from "next/server";
import {
  verifyCommitter,
  resolveRepo,
  resolveContributor,
  buildEndBody,
  sessionIntervalsFor,
  humanTurnsFor,
  upsertWorkSession,
  recomputePersonDays,
  relinkRepoTokens,
  type TelemetryEntry,
} from "@/entities/htt";
import { insertSyncRuns } from "@/entities/htt";

/**
 * Telemetry ingest fan-out, ported from the Human Token Tracker
 * (api/ingest/session). Auth: `Authorization: Bearer INGEST_TRIGGER_SECRET`.
 * Per Claude session entry: verify the committer, resolve the repo (htt.repos),
 * POST the token row to the ingest-session-end edge function, then store the
 * session's active intervals in htt.work_sessions. Once every entry is in, the
 * days each person touched are recomputed under the hours rule
 * (entities/htt/day-hours.ts) and the unlinked token rows are relinked to
 * their PRs. Legacy `record_type: "human"` entries carried a wall-clock day
 * figure computed on the contributor's Mac; they are counted and ignored.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.INGEST_TRIGGER_SECRET;
  if (!secret) {
    // Refuse to run with no secret configured; an empty-string compare would
    // otherwise authorize a bare "Bearer " header.
    return NextResponse.json({ error: "INGEST_TRIGGER_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fnBase = `${process.env.SUPABASE_URL}/functions/v1`;
  const ingestSecret = process.env.INGEST_SECRET ?? "";

  const entries = (await req.json()) as TelemetryEntry[];
  let linked = 0,
    skipped = 0,
    rejected = 0,
    skippedNoKey = 0,
    legacyHuman = 0;
  const errors: string[] = [];
  // Repos that received at least one successfully-inserted entry this request.
  // After the inserts are awaited, we relink each repo's unlinked token rows to
  // their PRs (attribution no longer waits for a future PR sync). A Set
  // de-dupes when several entries share a repo.
  const touchedRepos = new Set<string>();
  // Local days touched per person, recomputed once at the end.
  const daysByPerson = new Map<string, Set<string>>();

  for (const e of entries) {
    if (!verifyCommitter(e)) {
      rejected++;
      continue;
    }
    if (e.record_type === "human") {
      legacyHuman++;
      continue;
    }
    const ids = await resolveRepo(e.repo_full_name);
    if (!ids) {
      skipped++;
      continue;
    }
    // Claude token row: must carry session_id (its idempotency key), else
    // skip it rather than forward an un-dedupable row.
    const claudeBody = buildEndBody(e, ids);
    if (!claudeBody) {
      skippedNoKey++;
      continue;
    }
    try {
      const r = await fetch(`${fnBase}/ingest-session-end`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-secret": ingestSecret },
        body: JSON.stringify(claudeBody),
      });
      if (!r.ok) {
        errors.push(`claude e=${r.status}`);
        continue;
      }
      linked++;
      touchedRepos.add(ids.repoId);
      // The edge function answers { excluded: true } for the client's own
      // identities; their sessions are not delivery and must not become hours.
      const body = (await r.json().catch(() => ({}))) as { excluded?: boolean };
      if (body.excluded) continue;
      const personId = await resolveContributor(e.author_email);
      const days = await upsertWorkSession({
        companyId: ids.companyId,
        repoId: ids.repoId,
        personId,
        sessionId: claudeBody.session_id,
        startedAt: e.started_at,
        endedAt: e.ended_at ?? null,
        activeIntervals: sessionIntervalsFor(e),
        humanTurns: humanTurnsFor(e),
        tokensTotal: e.claude_tokens ?? 0,
      });
      if (personId) {
        const set = daysByPerson.get(personId) ?? new Set<string>();
        for (const d of days) set.add(d);
        daysByPerson.set(personId, set);
      }
    } catch (err) {
      errors.push(String(err));
    }
  }

  let daysRecomputed = 0;
  for (const [personId, days] of daysByPerson) {
    try {
      daysRecomputed += await recomputePersonDays(personId, [...days]);
    } catch (err) {
      errors.push(`recompute ${personId}=${String(err)}`);
    }
  }

  // Link the just-inserted (and any previously-unlinked) token rows to their
  // PRs. Tolerant: a relink failure must never fail the ingest.
  let relinked = 0;
  for (const repoId of touchedRepos) {
    try {
      relinked += await relinkRepoTokens(repoId);
    } catch (err) {
      errors.push(`relink ${repoId}=${String(err)}`);
    }
  }

  await insertSyncRuns({
    prs_upserted: 0,
    projects_synced: linked,
    unattributed: skipped,
    errors: errors, // jsonb array
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json({ linked, skipped, rejected, skippedNoKey, legacyHuman, daysRecomputed, relinked });
}
