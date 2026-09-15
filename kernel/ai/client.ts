import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place an Anthropic client is constructed.
 *
 * Nineteen call sites used to do `new Anthropic()` each on their own, so none
 * of them shared a timeout or a retry policy and a hung request rode the
 * function until Vercel killed it. The SDK client is stateless apart from
 * config, so one lazily-built instance serves the whole process.
 *
 *   timeout     ANTHROPIC_TIMEOUT_MS, default 120s. Long enough for an 8k-token
 *               structured answer on Sonnet; short enough that a stuck upstream
 *               fails before the platform timeout does.
 *   maxRetries  2 — the SDK retries 408/409/429/5xx and connection errors with
 *               backoff.
 *
 * The API key still comes from ANTHROPIC_API_KEY, read by the SDK itself.
 */

export const DEFAULT_TIMEOUT_MS = 120_000;

let instance: Anthropic | null = null;

/** Parsed ANTHROPIC_TIMEOUT_MS; anything that is not a positive integer falls back. */
export function anthropicTimeoutMs(): number {
  const raw = process.env.ANTHROPIC_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_TIMEOUT_MS;
}

/** The shared client. Throws (from the SDK) if ANTHROPIC_API_KEY is unset. */
export function anthropic(): Anthropic {
  if (!instance) {
    instance = new Anthropic({ timeout: anthropicTimeoutMs(), maxRetries: 2 });
  }
  return instance;
}

/**
 * For the fail-soft callers that used to write
 * `process.env.ANTHROPIC_API_KEY ? new Anthropic() : null`.
 */
export function anthropicIfConfigured(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? anthropic() : null;
}

/** Drop the cached instance so the next call re-reads the env. Tests only. */
export function resetAnthropicClient(): void {
  instance = null;
}
