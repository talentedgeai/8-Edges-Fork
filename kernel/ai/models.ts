/**
 * The one place a Claude model id is spelled.
 *
 * Every call site names a *tier*, not a model, and resolves it through
 * `modelFor(site, tier)`. `site` is the same string the call site already
 * passes to `logAiUsage` / `readTextOutput` in lib/ai/response.ts, so the
 * usage line, the env override, and the model choice all key off one name.
 *
 * Tiers follow the cost policy: operational AI runs on `fast` (Haiku) or
 * `standard` (Sonnet); `deep` (Opus) is reserved for work that is provably
 * too hard for Sonnet, and nothing on a per-upload or per-request path uses it.
 *
 * Overrides, most specific first:
 *   1. `AI_MODEL_<SITE>` — the site name upper-cased, `-` → `_`
 *      (e.g. `AI_MODEL_INTERVIEW_PANELIST`). Works for every site.
 *   2. The legacy shared names in `SITE_ENV` (CHATBOT_MODEL, WRITER_CLAUDE_MODEL,
 *      ...), kept so existing Vercel config keeps working unchanged.
 *   3. The tier default.
 *
 * No path-alias imports here: lib/ai/models.test.ts runs under plain `node --test`.
 */

export const TIERS = {
  fast: "claude-haiku-4-5",
  standard: "claude-sonnet-5",
  deep: "claude-opus-5",
} as const;

export type Tier = keyof typeof TIERS;

/**
 * Legacy env override names, by logAiUsage site. Several sites share one name
 * on purpose — that is how they were configured before the registry existed.
 */
export const SITE_ENV: Readonly<Record<string, string>> = {
  "admin-chat": "CHATBOT_MODEL",
  "team-chat": "CHATBOT_MODEL",
  "program-plan": "CHATBOT_MODEL",
  "publish-editor": "WRITER_CLAUDE_MODEL",
  "brand-writer": "WRITER_CLAUDE_MODEL",
  "campaign-seo": "WRITER_CLAUDE_MODEL",
  "entry-copy": "WRITER_CLAUDE_MODEL",
  "admin-idea-plan": "IDEAS_CLAUDE_MODEL",
  "idea-trends": "IDEAS_CLAUDE_MODEL",
  "meeting-summary": "MEETINGS_CLAUDE_MODEL",
  "review-summary": "REVIEW_CLAUDE_MODEL",
  "coaching-text": "COACHING_CLAUDE_MODEL",
  "coaching-summary": "COACHING_CLAUDE_MODEL",
  "roadmap-assist": "ROADMAP_ASSIST_MODEL",
  "interview-panelist": "INTERVIEW_CLAUDE_MODEL",
};

/** `AI_MODEL_<SITE>` for a logAiUsage site name. */
export function envNameFor(site: string): string {
  return `AI_MODEL_${site.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

type Env = Record<string, string | undefined>;

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the model for one call site. `env` is injectable for tests; every
 * production caller uses the default `process.env`.
 */
export function modelFor(site: string, tier: Tier, env: Env = process.env): string {
  const specific = nonBlank(env[envNameFor(site)]);
  if (specific) return specific;
  const legacy = SITE_ENV[site];
  const shared = legacy ? nonBlank(env[legacy]) : undefined;
  if (shared) return shared;
  return TIERS[tier];
}

/**
 * OpenRouter spells point releases with a dot (`anthropic/claude-haiku-4.5`)
 * where Anthropic uses a dash (`claude-haiku-4-5`). The registry keeps the
 * Anthropic spelling and derives the slug, so there is one place to change a
 * model id.
 */
export function openRouterSlug(model: string): string {
  return `anthropic/${model.replace(/-(\d+)-(\d+)$/, "-$1.$2")}`;
}
