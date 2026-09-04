import { NextResponse } from "next/server";
import { htt } from "@/lib/supabase";
import {
  verifyCommitter,
  resolveRepo,
  buildEndBody,
  buildManHourBodies,
  buildHumanEndBody,
  type TelemetryEntry,
} from "@/lib/htt/session-ingest";
import { relinkRepoTokens } from "@/lib/htt/token-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Each entry fans out into sequential edge-function calls, so a batch's wall
// time scales with batch size. Raised so a full 25-entry batch always fits.
export const maxDuration = 300;

/**
 * Telemetry ingest fan-out, ported from the Human Token Tracker
 * (api/ingest/session). Auth: `Authorization: Bearer INGEST_TRIGGER_SECRET`.
 * Per entry: verify the committer, resolve the repo (htt.repos), then POST to
 * the two Supabase edge functions (ingest-session-start writes
 * htt.man_hour_entries, ingest-session-end writes htt.token_entries), then
 * relink unlinked token rows to their PRs and record a htt.sync_runs row.
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
    skippedNoKey = 0;
  const errors: string[] = [];
  // Repos that received at least one successfully-inserted entry this request.
  // After the inserts are awaited, we relink each repo's unlinked token rows to
  // their PRs (attribution no longer waits for a future PR sync). A Set
  // de-dupes when several entries share a repo.
  const touchedRepos = new Set<string>();

  for (const e of entries) {
    if (!verifyCommitter(e)) {
      rejected++;
      continue;
    }
    const ids = await resolveRepo(e.repo_full_name);
    if (!ids) {
      skipped++;
      continue;
    }
    const post = (fn: string, body: unknown) =>
      fetch(`${fnBase}/${fn}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-secret": ingestSecret },
        body: JSON.stringify(body),
      });
    try {
      if (e.record_type === "human") {
        // Man-hour rows: only entries with a valid (person, day) key survive.
        for (const mh of buildManHourBodies(e, ids)) await post("ingest-session-start", mh);
        // Daily human-effort row: must carry occurred_on, else it can't be deduped.
        const humanBody = buildHumanEndBody(e, ids);
        if (!humanBody) {
          skippedNoKey++;
          continue; // never forward a keyless row
        }
        const r = await post("ingest-session-end", humanBody);
        if (r.ok) {
          linked++;
          touchedRepos.add(ids.repoId);
        } else errors.push(`human e=${r.status}`);
      } else {
        // Claude token row: must carry session_id (its idempotency key), else
        // skip it rather than forward an un-dedupable row.
        const claudeBody = buildEndBody(e, ids); // claude: tokens only, no man-hours
        if (!claudeBody) {
          skippedNoKey++;
          continue;
        }
        const r = await post("ingest-session-end", claudeBody);
        if (r.ok) {
          linked++;
          touchedRepos.add(ids.repoId);
        } else errors.push(`claude e=${r.status}`);
      }
    } catch (err) {
      errors.push(String(err));
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

  await htt.from("sync_runs").insert({
    prs_upserted: 0,
    projects_synced: linked,
    unattributed: skipped,
    errors: errors, // jsonb array
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json({ linked, skipped, rejected, skippedNoKey, relinked });
}
