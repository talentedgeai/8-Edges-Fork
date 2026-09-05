import vercelConfig from "@/vercel.json";

// Agent Management (Settings → Agents): one pane over every managed routine we
// run, unified across hosts. A "managed agent" here is a scheduled worker with
// four things worth seeing at a glance: the CONTENT it reads, the SKILL (or
// route) it follows, the ROUTINE (schedule) it runs on, and the APPS it talks
// to.
//
// Two hosts feed this page, and both are things Edge8 itself runs:
//   - Vercel: the crons in vercel.json. Their schedules are read LIVE from that
//     file (the source of truth), so a schedule change there shows here with no
//     edit; the human-facing metadata (what each reads, which apps it touches)
//     is enriched below by cron path. A cron with no enrichment still renders,
//     flagged, rather than being silently dropped.
//   - Mac mini: the launchd jobs installed on the office Mac mini, listed in
//     MAC_MINI_ROUTINES next to the script each one runs.
// Whether a routine actually ran, and what it did, comes from
// company_os.routine_runs (kernel/audit/routine-runs.ts), which every routine
// on both hosts writes. The page joins the two: definition here, evidence there.
// Personal Claude Desktop tasks on laptops are deliberately not listed: the
// page cannot observe them, and policy is that routines do not live on laptops.

export type RoutineHost = "vercel" | "mac-mini";

export type Routine = {
  id: string;
  name: string;
  description: string;
  host: RoutineHost;
  // Where the routine physically runs, in words (e.g. the exact machine a local
  // routine was captured on). Vercel routines just say "Vercel".
  hostLabel: string;
  // Human schedule ("Weekdays 07:00 UTC"). For Vercel routines this is derived
  // live from the cron expression in vercel.json.
  schedule: string;
  // Raw cron expression when there is one (Vercel crons; some local routines).
  cron?: string;
  // The data / subjects it reads.
  content: string[];
  // The skill it follows (local) or the route handler that is its logic (Vercel).
  skill: string;
  // Connected apps / services.
  apps: string[];
};

// ── Vercel cron enrichment ────────────────────────────────────────────────
// Keyed by the cron `path` in vercel.json. Schedules are NOT stored here (they
// come live from vercel.json); only the human metadata that the raw cron entry
// cannot carry. Descriptions and apps are drawn from each route's own header.
type CronMeta = { name: string; description: string; content: string[]; apps: string[] };

const CRON_META: Record<string, CronMeta> = {
  "/api/cron/contractor-payments/": {
    name: "Contractor payments",
    description: "Rolls the previous month's accepted contractor work into payment requests, on the 1st.",
    content: ["Contractor work", "Payment requests"],
    apps: ["Supabase"],
  },
  "/api/cron/probation-reviews/": {
    name: "Probation reviews",
    description: "Emails the manager and founder exactly when a probation lands 14 days out, so the review happens before it ends.",
    content: ["Probation dates"],
    apps: ["Supabase", "Resend"],
  },
  "/api/cron/performance-reviews/": {
    name: "Performance reviews",
    description: "Opens review cycles whose moment date has arrived (probation +6w, mid-year +5m, renewal +11m) and chases open cycles weekly.",
    content: ["Review cycles", "Employee anchors"],
    apps: ["Supabase", "Resend"],
  },
  "/api/cron/onboarding-cycle/": {
    name: "Onboarding cycle",
    description: "One daily pass over every onboarding journey: backfill, nag for plans, Day 8 survey, probation trigger, promotions, 180-day stay interview.",
    content: ["Onboarding journeys"],
    apps: ["Supabase", "Resend"],
  },
  "/api/cron/coaching-cycle/": {
    name: "Coaching cycle",
    description: "Daily pass over active coaching profiles: 1-1 prep, lapsed-cadence nudges, mid-cycle check-ins, monthly trend reports. Lands before 09:00 +07.",
    content: ["Coaching profiles", "1-1 cadences"],
    apps: ["Supabase", "Resend", "Lark"],
  },
  "/api/cron/coaching-recaps/": {
    name: "Coaching recaps",
    description: "Hourly. Drafts the recap for one held 1-1 that has a transcript and no summary. Summarising is an Opus job, kept off the daily cycle on purpose.",
    content: ["1-1 transcripts"],
    apps: ["Supabase", "Lark", "Claude"],
  },
  "/api/cron/qbo-refresh/": {
    name: "QuickBooks token refresh",
    description: "Weekly QuickBooks token keepalive per connected company, so a connection never idles out. Lark-warns on failure or near-expiry.",
    content: ["QBO connections"],
    apps: ["QuickBooks", "Lark"],
  },
  "/api/cron/qbo-invoice-sync/": {
    name: "QuickBooks invoice sync",
    description: "Weekly read-from-QBO, upsert-into-Supabase invoice mirror per connected company. Never deletes. Runs after the token keepalive.",
    content: ["QBO invoices"],
    apps: ["QuickBooks", "Supabase", "Lark"],
  },
  "/api/cron/ideas-digest/": {
    name: "Ideas digest",
    description: "Daily. Emails the founder and pings Lark ops with everything the team submitted to the idea box.",
    content: ["Idea submissions"],
    apps: ["Supabase", "Lark", "Resend"],
  },
  "/api/cron/board-digest/": {
    name: "Board digest",
    description: "Daily. Emails each active team member a summary of their open board cards, grouped by board, oldest-due first, overdue flagged.",
    content: ["Board cards"],
    apps: ["Supabase", "Resend"],
  },
  "/api/cron/email-campaign-send/": {
    name: "Email campaign send",
    description: "Every 15 minutes. Sends the next batch of a scheduled email campaign sequentially, one Resend call per recipient.",
    content: ["Email campaigns", "Recipients"],
    apps: ["Supabase", "Resend"],
  },
  "/api/cron/marketing-digest/": {
    name: "Marketing digest",
    description: "Daily. Reminds the founder of manual-post content (blog, LinkedIn, Facebook) due today or overdue and not yet posted.",
    content: ["Marketing calendar"],
    apps: ["Supabase", "Lark"],
  },
  "/api/cron/blog-publish/": {
    name: "Blog auto-publish",
    description: "Daily. Auto-publishes blog assets that were scheduled and are now due, and pings Lark ops.",
    content: ["Blog assets"],
    apps: ["Supabase", "Lark"],
  },
  "/api/cron/idea-trends/": {
    name: "Idea trends",
    description: "Weekly, Monday. Regenerates the 'trends across ideas' summary shown on the Innovation cockpit and stores it.",
    content: ["Idea submissions"],
    apps: ["Supabase"],
  },
  "/api/cron/htt-sync-prs/": {
    name: "HTT: PR sync",
    description: "Nightly. For every tracked repo with a GitHub repo, fetches PRs updated since the last run and upserts them (Human Token Tracker).",
    content: ["GitHub PRs (tracked repos)"],
    apps: ["GitHub", "Supabase"],
  },
  "/api/cron/htt-ingest-effort-logs/": {
    name: "HTT: effort-log ingest",
    description: "Nightly. Ingests each tracked repo's effort-log file into the Human Token Tracker.",
    content: ["Effort logs (tracked repos)"],
    apps: ["GitHub", "Supabase"],
  },
  "/api/cron/htt-refresh-summaries/": {
    name: "HTT: summary refresh",
    description: "Nightly, after the PR sync. Refreshes per-repo summaries and goals for the Human Token Tracker.",
    content: ["Repo digests", "Project goals"],
    apps: ["GitHub", "Supabase"],
  },
};

// ── Mac mini routines ─────────────────────────────────────────────────────
// launchd jobs on the office Mac mini. Each records its run through
// scripts/routine-run-record.mjs, so the Agents page shows it beside the crons.
export const MAC_MINI_ROUTINES: Routine[] = [
  {
    id: "mac-mini:htt-nightly-sync",
    name: "HTT: nightly local sync",
    description:
      "Nightly. Syncs pull requests for every tracked repo, ingests recorder telemetry from the tracker branch, and backfills the Mac mini's own Claude sessions into the Human Token Tracker. Bridges the hosted pipeline until its secrets exist.",
    host: "mac-mini",
    hostLabel: "Office Mac mini (launchd ai.edge8.htt-nightly-sync)",
    schedule: "Daily, 03:30 Asia/Ho_Chi_Minh",
    cron: "30 3 * * *",
    content: ["GitHub PRs (tracked repos)", "Recorder telemetry", "Local Claude transcripts"],
    skill: "scripts/htt/nightly-local-sync.sh",
    apps: ["GitHub", "Supabase"],
  },
];


// ── Cron → human schedule ─────────────────────────────────────────────────
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Best-effort, readable rendering of the cron shapes we actually use. Falls
// back to the raw expression rather than guessing on anything exotic.
export function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const everyN = min.match(/^\*\/(\d+)$/);
  if (everyN && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${everyN[1]} minutes`;
  }
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "Every minute";
  }

  const mm = /^\d+$/.test(min) ? min.padStart(2, "0") : null;
  const hh = /^\d+$/.test(hour) ? hour.padStart(2, "0") : null;
  const time = mm && hh ? `${hh}:${mm} UTC` : null;

  // Hourly at a given minute.
  if (hh === null && mm && dom === "*" && mon === "*" && dow === "*") {
    return `Hourly at :${mm} UTC`;
  }

  let when = "";
  if (dow !== "*" && /^\d+$/.test(dow)) when = `${DOW[Number(dow) % 7]}`;
  else if (dom !== "*" && /^\d+$/.test(dom)) when = `Day ${dom} of the month`;
  else when = "Daily";

  return time ? `${when}, ${time}` : `${when} (${expr})`;
}

// ── Loader ────────────────────────────────────────────────────────────────
export type AgentManagementView = {
  routines: Routine[];
  vercel: Routine[];
  macMini: Routine[];
};

export function loadAgentManagement(): AgentManagementView {
  const crons = (vercelConfig.crons ?? []) as { path: string; schedule: string }[];

  const vercel: Routine[] = crons.map((c) => {
    const meta = CRON_META[c.path];
    return {
      id: c.path,
      name: meta?.name ?? c.path,
      description:
        meta?.description ??
        "No metadata yet for this cron. Add it to CRON_META in entities/company-os/lib/agent-management.ts.",
      host: "vercel",
      hostLabel: "Vercel",
      schedule: cronToHuman(c.schedule),
      cron: c.schedule,
      content: meta?.content ?? [],
      skill: `app${c.path}route.ts`,
      apps: meta?.apps ?? [],
    };
  });

  const macMini = MAC_MINI_ROUTINES;
  return { routines: [...vercel, ...macMini], vercel, macMini };
}

export function findRoutine(id: string): Routine | null {
  return loadAgentManagement().routines.find((r) => r.id === id) ?? null;
}
