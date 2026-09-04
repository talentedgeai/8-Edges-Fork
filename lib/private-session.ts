// Saigon Private Retreat config. Single source of truth for pricing, copy,
// programme, and the Stripe checkout composition. Edit here and the page and
// the checkout API stay in sync.
//
// Pricing model (2026 update):
//   - 3, 4, or 5 days.
//   - $7,000 base = a 3-day retreat for the first person. Includes the
//     pre-retreat consultation, project setup, a Mac Mini configured with 8
//     working agents, and 40 human tokens of post-retreat polish.
//   - +$1,000 per extra day (the first person going 4 or 5 days).
//   - +$1,000 per additional person, per day. Each additional person includes
//     VIP immigration, airport pickup, a room at the AIO Pad, daily lunch,
//     a private car and driver, and the Travel Buddy app.
//
//   total = 7000 + (days - 3) * 1000 + (teamSize - 1) * days * 1000
//
// For Stripe this is two prices: a $7,000 base (qty 1) and a $1,000 "day unit"
// (qty = dayUnits), so any day/team combination resolves without pre-creating
// a price per permutation.

export const BASE_DAYS = 3;
export const MAX_DAYS = 5;
export const BASE_PRICE = 7000;
export const DAY_RATE = 1000;
export const DAY_OPTIONS = [3, 4, 5] as const;
export type DayCount = (typeof DAY_OPTIONS)[number];

/** The base price covers the first person. */
export const BASE_TEAM_SIZE = 1;

/** Stripe price env vars. The operator creates these once in the dashboard. */
export const BASE_PRICE_ENV = "STRIPE_PRICE_SAIGON_PRIVATE_BASE";
export const DAY_PRICE_ENV = "STRIPE_PRICE_SAIGON_PRIVATE_DAY";

export function isValidDays(days: number): days is DayCount {
  return DAY_OPTIONS.includes(days as DayCount);
}

export function calculateTotal(days: number, teamSize: number): number {
  const extraDays = Math.max(0, days - BASE_DAYS);
  const additionalPeople = Math.max(0, teamSize - BASE_TEAM_SIZE);
  return BASE_PRICE + extraDays * DAY_RATE + additionalPeople * days * DAY_RATE;
}

/** Number of $1,000 day-units: extra days for person one, plus every day for
 *  each additional person. total === BASE_PRICE + DAY_RATE * dayUnits(...). */
export function dayUnits(days: number, teamSize: number): number {
  const extraDays = Math.max(0, days - BASE_DAYS);
  const additionalPeople = Math.max(0, teamSize - BASE_TEAM_SIZE);
  return extraDays + additionalPeople * days;
}

// ── The Hormozi value stack ──────────────────────────────────────────────
// What you actually get, priced at what each piece would cost on its own. The
// sum is the anchor; the price is the reveal.

export const VALUE_STACK: Array<{ item: string; value: string }> = [
  { item: "2 to 3 working applications, built on your real data", value: "$20,000 – $50,000" },
  { item: "A Mac Mini, pre-loaded with 8 working AI agents, yours to take home", value: "$5,000+" },
  { item: "The 18 Protocols, the operating system we build every client on (a standalone AI bootcamp runs to $5,000)", value: "$5,000" },
  { item: "AI engineers building beside you in the room for the full retreat", value: "$10,000+" },
  { item: "The Polish: 40 human tokens to take your builds to production after you fly home", value: "$2,000" },
  { item: "The Saigon concierge week: VIP immigration, private car and driver, the AIO Pad, daily lunch, the Travel Buddy app", value: "$5,000+" },
  { item: "18 protocols learned and infinite leverage that keeps compounding", value: "Priceless" },
];

export const VALUE_TOTAL = "$47,000 – $77,000+";

export const PROOF = {
  apps: ["CRM systems", "Applicant Tracking", "Event Management", "Survey Tools"],
  line: "The kind of internal software companies pay $20,000 to $50,000 to have built, and you walk out with two or three of it.",
};

// ── Outcomes (what you leave with) ───────────────────────────────────────
export const OUTCOMES = [
  {
    label: "01",
    heading: "2 to 3 working applications",
    desc: "Not slides, not a prototype. Real software running on your real data. Past teams have walked out with CRMs, applicant tracking, event tools, and survey systems worth $20,000 to $50,000 to build.",
  },
  {
    label: "02",
    heading: "A Mac Mini with 8 working agents",
    desc: "Your AI team, configured and on your desk before you fly out. Accounts, dashboards, API keys, sync, all of it ready to run the software you just built.",
  },
  {
    label: "03",
    heading: "The 18 Protocols, installed",
    desc: "The operating system we build every client on, mapped to your business. Where leverage lives, named. You leave able to keep building, not waiting for us.",
  },
  {
    label: "04",
    heading: "The Polish, for 30 days after",
    desc: "40 human tokens so our experts take your builds to production quality once you are home, and maybe build the next one with you.",
  },
];

// ── What's included / not ────────────────────────────────────────────────
export const INCLUDED = [
  "Pre-retreat consultation to lock your scope before you fly",
  "Project setup and a fresh Mac Mini configured with 8 working AI agents",
  "A dedicated AI engineer building beside you for the full retreat",
  "Private CAIO roadmap session on day one",
  "2 to 3 applications shipped to production on your real data",
  "The Polish: 40 human tokens (~40 hours) to perfect your builds in the 30 days after",
  "For everyone on your team: VIP immigration fast-track, airport pickup, a room at the AIO Pad, daily lunch, a private car and driver, and the Travel Buddy app",
];

export const NOT_INCLUDED = [
  "International flights",
  "Domain registration and SaaS subscriptions for your business",
  "API costs (Claude, OpenAI, etc.) past the included token allowance",
  "Advertising spend",
  "Legal or accounting work",
];

export const FILTER_BULLETS = [
  "You have an idea worth building, not a pitch deck",
  "You can free up 3 to 5 days, solo or with your operator-level team",
  "You're done waiting for an engineer to make time for you",
];

// ── Programme (3-day and 5-day exemplar arcs; a 4-day sits between) ───────
export const PROGRAMS: Record<"3day" | "5day", Array<{
  num: string;
  title: string;
  sub: string;
  items: string[];
}>> = {
  "3day": [
    {
      num: "Day 01",
      title: "Blueprint and Roadmap",
      sub: "Morning to evening",
      items: [
        "Private CAIO roadmap session: where leverage lives, what to ship first",
        "Three-layer company model and Agent Org Chart for your business",
        "Concept selection, scope lock, success criteria",
        "Engineer paired, environment set up on a fresh Mac mini",
      ],
    },
    {
      num: "Day 02",
      title: "Build Day",
      sub: "Vibe-code to working software",
      items: [
        "Hands-on build with your engineer in the room",
        "Website, agents, data plumbing, integrations",
        "Goal: working software on real data by end of day",
      ],
    },
    {
      num: "Day 03",
      title: "Production and Handoff",
      sub: "Ship and walk out",
      items: [
        "Polish, harden, deploy to production",
        "Mac mini configured: accounts, dashboards, sync, API keys",
        "The Polish: 40 human tokens to perfect it over the next 30 days",
      ],
    },
  ],
  "5day": [
    {
      num: "Day 01",
      title: "Blueprint and Roadmap",
      sub: "Foundation",
      items: [
        "Private CAIO roadmap session: where leverage lives, what to ship first",
        "Three-layer company model and Agent Org Chart for your business",
        "Concept selection, scope lock, success criteria",
        "Engineer paired, environment set up on a fresh Mac mini",
      ],
    },
    {
      num: "Day 02",
      title: "Build Day One",
      sub: "Core software",
      items: [
        "Vibe-code the spine: website, primary flow, data model",
        "First agent on real data",
        "Daily sync with the CAIO on direction",
      ],
    },
    {
      num: "Day 03",
      title: "Build Day Two",
      sub: "Integrations and agents",
      items: [
        "Stack out: CRM, payments, email, automations",
        "Multiple agents wired into your real business data",
        "First end-to-end test of the production flow",
      ],
    },
    {
      num: "Day 04",
      title: "Build Day Three",
      sub: "Polish and harden",
      items: [
        "Bug fixes, edge cases, error handling",
        "Performance, security, deploy infrastructure",
        "Mac mini configured: accounts, dashboards, sync, API keys",
      ],
    },
    {
      num: "Day 05",
      title: "Launch and Handoff",
      sub: "Ship and plan the month",
      items: [
        "Push to production, smoke-test live",
        "30-day launch plan: what to monitor, what to iterate",
        "The Polish: 40 human tokens to perfect it over the next 30 days",
      ],
    },
  ],
};

export const FAQS = [
  {
    q: "What does it cost?",
    a: "$7,000 for a 3-day retreat for the first person. That includes the pre-retreat consultation, project setup, a Mac Mini configured with 8 working agents, and 40 human tokens of post-retreat polish. Each extra day is $1,000. Each additional person is $1,000 per day, which covers their VIP immigration, airport pickup, room at the AIO Pad, daily lunch, private car and driver, and Travel Buddy app.",
  },
  {
    q: "Can I really walk out with working software in 3 to 5 days?",
    a: "Yes, with the right scope. The pre-retreat consultation and day-one roadmap lock the build to what ships in the time you have. Your engineer is dedicated to you for the full duration, and the Mac Mini, environment, and agents are set up to remove every blocker except the work itself. Past teams have shipped CRMs, applicant tracking, event management, and survey tools.",
  },
  {
    q: "What is The Polish?",
    a: "40 human tokens, included, for the 30 days after you fly home. One token is roughly one hour of expert work. Our team uses them to take your builds from working to production quality, fix the edge cases, and, if there is room, build the next thing. It is how we make sure you do not ship and stall.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. The agents and your engineer handle the build. You bring the business context, the customer knowledge, and the decisions. They handle the integrations, prompts, deployment, and infrastructure.",
  },
  {
    q: "Why is this so much cheaper than hiring a dev shop?",
    a: "Because AI does most of the labor and you watch it happen. A dev shop charges $20,000 to $50,000 to build one of these apps over months. You build two or three in days, and you leave able to do it again without us. The software you walk out with is worth multiples of the price.",
  },
  {
    q: "Can I bring my team, and is there a max size?",
    a: "Yes. The base covers one person; each additional person is $1,000 per day, everything included. The AIO Pad sleeps up to 6 across two units, and for larger teams we have access to more apartments in the same neighborhood.",
  },
  {
    q: "What happens after the 40 tokens?",
    a: "If you want to keep going, the continuation is $2,000 a month for another 40 tokens, cancel anytime. We meter Claude tokens and human tokens on a shared dashboard so you always know what you have left.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Full refund up to 30 days before your start date. Inside 30 days, the booking can be rescheduled to another date in the next 6 months at no charge.",
  },
  {
    q: "Why Saigon?",
    a: "Saigon is where the AI Officer Institute team and engineering capacity live, and where we host the AIO Pad. It is a short flight from most Asia-Pacific hubs, the food and hospitality are world class, and the team can give you their full attention for the week.",
  },
];
