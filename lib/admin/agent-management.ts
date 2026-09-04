import vercelConfig from "@/vercel.json";

// Agent Management (Settings → Agents): one pane over every managed routine we
// run, unified across hosts. A "managed agent" here is a scheduled worker with
// four things worth seeing at a glance: the CONTENT it reads, the SKILL (or
// route) it follows, the ROUTINE (schedule) it runs on, and the APPS it talks
// to.
//
// Two hosts feed this page:
//   - Vercel: the crons in vercel.json. Their schedules are read LIVE from that
//     file (the source of truth), so a schedule change there shows here with no
//     edit; the human-facing metadata (what each reads, which apps it touches)
//     is enriched below by cron path. A cron with no enrichment still renders,
//     flagged, rather than being silently dropped.
//   - Local: Claude Desktop scheduled-tasks captured from ~/.claude/scheduled-
//     tasks. These are a snapshot (see CAPTURE below), not a live read: a page
//     deployed on Vercel cannot read a personal machine's filesystem at request
//     time.
//
// Policy: routines belong on the Mac mini, never on a laptop. Any routine whose
// observed host is a laptop is a violation and is surfaced as such.

export type RoutineHost = "vercel" | "mac-mini" | "laptop";

export type RoutineStatus = "active" | "paused" | "one-time" | "manual";

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
  status: RoutineStatus;
};

// When and from where the local snapshot below was captured. Shown on the page
// so its staleness is never a mystery.
export const LOCAL_CAPTURE = {
  at: "2026-08-27",
  from: "David's MacBook Pro (Mac15,3, Apple M3)",
  path: "~/.claude/scheduled-tasks",
} as const;

// ── Vercel cron enrichment ────────────────────────────────────────────────
// Keyed by the cron `path` in vercel.json. Schedules are NOT stored here (they
// come live from vercel.json); only the human metadata that the raw cron entry
// cannot carry. Descriptions and apps are drawn from each route's own header.
type CronMeta = { name: string; description: string; content: string[]; apps: string[] };

const CRON_META: Record<string, CronMeta> = {
  "/api/trip-passport-cleanup/": {
    name: "Trip passport cleanup",
    description: "Deletes trip passport images 30 days after the trip, fulfilling the form's deletion promise. No-op until the cutoff passes.",
    content: ["Trip passports"],
    apps: ["Supabase"],
  },
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

// ── Local routines (snapshot) ─────────────────────────────────────────────
// Captured from ~/.claude/scheduled-tasks on David's MacBook Pro. host is set
// to what was OBSERVED, not what is intended: these are on a laptop today, which
// is a policy violation the page is meant to make loud. Move them to the Mac
// mini and re-capture with host: "mac-mini".
const LAPTOP = LOCAL_CAPTURE.from;

export const LOCAL_ROUTINES: Routine[] = [
  {
    id: "1-1-friday-prep",
    name: "1-1 Friday prep",
    description: "Biweekly AI prep for 1-1s with Trac and Mai. Runs the Friday before a 1-1 week (even ISO weeks); skips odd weeks.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Biweekly, Friday (even ISO weeks)",
    content: ["1-1 history", "Coaching notes (Trac, Mai)"],
    skill: "1-1-coach",
    apps: ["Lark", "Supabase"],
    status: "active",
  },
  {
    id: "1-1-midcycle-checkin",
    name: "1-1 mid-cycle check-in",
    description: "Biweekly off-week Wednesday mid-cycle check-in for Trac and Mai. Skips 1-1 weeks.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Biweekly, Wednesday (even ISO weeks)",
    content: ["Coaching cadence (Trac, Mai)"],
    skill: "1-1-coach",
    apps: ["Lark"],
    status: "active",
  },
  {
    id: "1-1-monthly-trends",
    name: "1-1 monthly trends",
    description: "Monthly trend analysis for Trac and Mai. Runs on the 1st of every month.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Monthly, 1st",
    content: ["1-1 history", "Trend data (Trac, Mai)"],
    skill: "1-1-coach",
    apps: ["Lark", "Supabase"],
    status: "active",
  },
  {
    id: "1-1-post-meeting",
    name: "1-1 post-meeting",
    description: "Manual trigger: processes 1-1 meeting notes after a meeting ends.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Manual trigger",
    content: ["1-1 meeting notes"],
    skill: "1-1-coach",
    apps: ["Lark", "Supabase"],
    status: "manual",
  },
  {
    id: "daily-email-check",
    name: "Daily email check",
    description: "Every day at 08:00, reviews the last 24h of Gmail, picks the 3 most important messages, drafts a plain-language summary, and pings Lark.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Daily, 08:00",
    content: ["Gmail (last 24h)"],
    skill: "daily-email-check",
    apps: ["Gmail", "Lark"],
    status: "active",
  },
  {
    id: "fast-goal-dm-blast",
    name: "FAST goal DM blast",
    description: "One-time: DM the approved FAST-goal message to 20 Edge8 team members via Lark.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "One-time, 2026-08-27 09:00 +07",
    content: ["FAST goal message", "Team roster (20)"],
    skill: "fast-goal-dm-blast",
    apps: ["Lark"],
    status: "one-time",
  },
  {
    id: "pm-pr-watch",
    name: "PM PR watch",
    description: "Every 30 min on weekdays 09:00-18:00, notifies the Labs Lark group when new GitHub PRs are opened.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Weekdays, every 30 min, 09:00-18:00 +07",
    content: ["GitHub PRs (mahjong-tarot)"],
    skill: "product-manager",
    apps: ["GitHub", "Lark"],
    status: "active",
  },
  {
    id: "pm-standup-compile",
    name: "PM standup compile",
    description: "Weekdays at 09:00, compiles the daily standup briefing from check-ins and GitHub activity.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Weekdays, 09:00 +07",
    content: ["Daily check-ins", "GitHub activity"],
    skill: "product-manager",
    apps: ["GitHub", "Lark"],
    status: "active",
  },
  {
    id: "pm-standup-morning",
    name: "PM standup morning",
    description: "Weekdays at 07:00, runs the PM standup morning trigger (agent activity check + Lark reminder).",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Weekdays, 07:00 +07",
    content: ["Agent activity"],
    skill: "product-manager",
    apps: ["Lark"],
    status: "active",
  },
  {
    id: "pm-weekly-rag",
    name: "PM weekly RAG",
    description: "Fridays at 16:00, compiles the weekly Red/Amber/Green status report.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Fridays, 16:00 +07",
    content: ["Project status", "Weekly progress"],
    skill: "product-manager",
    apps: ["Lark"],
    status: "active",
  },
  {
    id: "quickbooks-invoice-sync",
    name: "QuickBooks invoice sync (local)",
    description: "Weekly sync of QuickBooks invoices into company_os.invoices. Overlaps the Vercel qbo-invoice-sync cron; reconcile before moving.",
    host: "laptop",
    hostLabel: LAPTOP,
    schedule: "Weekly",
    content: ["QBO invoices"],
    skill: "quickbooks-invoice-sync",
    apps: ["QuickBooks", "Supabase"],
    status: "active",
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
  local: Routine[];
  counts: { total: number; vercel: number; macMini: number; laptop: number };
  // Routines that break the "no routines on laptops" policy.
  violations: Routine[];
  capture: typeof LOCAL_CAPTURE;
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
        "No metadata yet for this cron. Add it to CRON_META in lib/admin/agent-management.ts.",
      host: "vercel",
      hostLabel: "Vercel",
      schedule: cronToHuman(c.schedule),
      cron: c.schedule,
      content: meta?.content ?? [],
      skill: `app${c.path}route.ts`,
      apps: meta?.apps ?? [],
      status: "active",
    };
  });

  const local = LOCAL_ROUTINES;
  const routines = [...vercel, ...local];
  const laptop = routines.filter((r) => r.host === "laptop");
  const macMini = routines.filter((r) => r.host === "mac-mini");

  return {
    routines,
    vercel,
    local,
    counts: {
      total: routines.length,
      vercel: vercel.length,
      macMini: macMini.length,
      laptop: laptop.length,
    },
    violations: laptop,
    capture: LOCAL_CAPTURE,
  };
}
