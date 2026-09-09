import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { updatePeople } from "@/kernel/identity/writes";
import type { Json } from "@/kernel/data/supabase/database.types";
import type { CertStatus, CertTrack } from "@/entities/team/lib/certifications";

// Mirrors each Edge8 member's AI Officer Institute certification progress into
// their own person record (people.metadata.certifications), which is what the
// /team home's "Get certified" card reads (lib/certifications.ts).
//
// Source: the aiolabz production Supabase project, read through PostgREST with
// its service-role key (the rollup view is security_invoker, so anything less
// only ever sees the caller's own rows). One request: v_certification_progress
// embedding app_user(email) and certification(slug), filtered to @edge8.ai
// learners. Read-from-aiolabz, write-into-company_os; never deletes, and only
// rewrites a person whose progress actually changed.
//
// A learner is matched to a person by email, lowercased on both sides. The
// aiolabz ids never enter company_os.

const EDGE8_DOMAIN = "@edge8.ai";

// Certification slugs on the Institute -> the keys the home card reads.
const TRACK_KEY: Record<string, CertTrack["key"]> = {
  "ai-officer": "ai_officer",
  "ai-engineer": "ai_engineer",
};

// The external boundary: validate what PostgREST hands back before trusting it.
const ProgressRow = z.object({
  completed: z.number().int().nonnegative(),
  total_published: z.number().int().nonnegative(),
  complete: z.boolean(),
  app_user: z.object({ email: z.string().email() }),
  certification: z.object({ slug: z.string() }),
});
const ProgressRows = z.array(ProgressRow);

type TrackProgress = { status: CertStatus; completed: number; total: number };
type PersonTracks = Partial<Record<CertTrack["key"], TrackProgress>>;

export type CertificationsSyncResult = {
  ok: boolean;
  error?: string;
  fetched: number; // progress rows for @edge8.ai learners
  learners: number; // distinct learner emails
  matched: number; // learners with a people row
  updated: number; // people rows whose progress changed
  unmatched: string[]; // learner emails with no people row
};

function statusOf(r: z.infer<typeof ProgressRow>): CertStatus {
  if (r.complete) return "certified";
  return r.completed > 0 ? "in_progress" : "not_started";
}

// A stable string for a certifications map: tracks sorted by key, each track's
// own fields sorted, and the volatile synced_at dropped. Two maps that hold the
// same progress compare equal whatever order they were built in.
function canonicalTracks(map: Record<string, Json>): string {
  const trackKeys = Object.keys(map).sort();
  return JSON.stringify(
    trackKeys.map((k) => {
      const t = (map[k] ?? {}) as Record<string, Json>;
      const { synced_at: _drop, ...rest } = t;
      const fields = Object.keys(rest).sort();
      return [k, fields.map((f) => [f, rest[f]])];
    }),
  );
}

async function fetchProgress(url: string, key: string): Promise<z.infer<typeof ProgressRows>> {
  const q = new URLSearchParams({
    select: "completed,total_published,complete,app_user!inner(email),certification!inner(slug)",
    "app_user.email": `ilike.*${EDGE8_DOMAIN}`,
    limit: "1000",
  });
  const res = await fetch(`${url}/rest/v1/v_certification_progress?${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`aiolabz responded ${res.status}`);
  return ProgressRows.parse(await res.json());
}

export async function syncCertifications(): Promise<CertificationsSyncResult> {
  const empty = { fetched: 0, learners: 0, matched: 0, updated: 0, unmatched: [] as string[] };
  const url = process.env.AIOLABZ_SUPABASE_URL;
  const key = process.env.AIOLABZ_SUPABASE_SERVICE_KEY;
  if (!url || !key) return { ok: false, error: "AIOLABZ_SUPABASE_URL / AIOLABZ_SUPABASE_SERVICE_KEY not set", ...empty };

  let rows: z.infer<typeof ProgressRows>;
  try {
    rows = await fetchProgress(url.replace(/\/$/, ""), key);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ...empty };
  }

  // Fold the rows into one progress map per learner, keyed by lowercased email.
  const byEmail = new Map<string, PersonTracks>();
  for (const r of rows) {
    const trackKey = TRACK_KEY[r.certification.slug];
    if (!trackKey) continue; // e.g. leadership: not one of the two tracks the card shows
    const email = r.app_user.email.toLowerCase();
    const tracks = byEmail.get(email) ?? {};
    tracks[trackKey] = { status: statusOf(r), completed: r.completed, total: r.total_published };
    byEmail.set(email, tracks);
  }

  const { data: people, error: peopleError } = await companyOs
    .from("people")
    .select("id, email, metadata")
    .ilike("email", `%${EDGE8_DOMAIN}`);
  if (peopleError) return { ok: false, error: `people read: ${peopleError.message}`, ...empty, fetched: rows.length, learners: byEmail.size };

  const personByEmail = new Map(
    ((people ?? []) as { id: string; email: string | null; metadata: Record<string, Json> | null }[])
      .filter((p) => p.email)
      .map((p) => [p.email!.toLowerCase(), p] as const),
  );

  let matched = 0;
  let updated = 0;
  const unmatched: string[] = [];
  const syncedAt = new Date().toISOString();

  for (const [email, tracks] of byEmail) {
    const person = personByEmail.get(email);
    if (!person) {
      unmatched.push(email);
      continue;
    }
    matched += 1;

    const metadata = person.metadata ?? {};
    const current = (metadata.certifications ?? {}) as Record<string, Json>;
    const next: Record<string, Json> = Object.fromEntries(
      Object.entries(tracks).map(([k, t]) => [k, { ...t, synced_at: syncedAt }]),
    );
    // Compare the progress itself, not the sync stamp or the key order, so an
    // unchanged learner is left alone and their updated_at stays honest. Both
    // sides are canonicalised (keys sorted, synced_at dropped) before compare;
    // otherwise every run rewrites every row and the "updated" count is a lie.
    if (canonicalTracks(current) === canonicalTracks(next)) continue;

    const { error: writeError } = await updatePeople({
      metadata: { ...metadata, certifications: next },
      updated_at: syncedAt,
    }).eq("id", person.id);
    if (writeError) return { ok: false, error: `people write: ${writeError.message}`, fetched: rows.length, learners: byEmail.size, matched, updated, unmatched };
    updated += 1;
  }

  return { ok: true, fetched: rows.length, learners: byEmail.size, matched, updated, unmatched };
}
