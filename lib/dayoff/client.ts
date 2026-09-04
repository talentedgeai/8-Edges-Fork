// Minimal Day Off API client. Server-only: reads DAYOFF_API_BASE and
// DAYOFF_API_KEY from the environment (.env.local). GETs only — this codebase
// never mutates Day Off. Relative imports throughout lib/dayoff so the CLI
// runner (scripts/dayoff-import-run.ts) works without path-alias resolution.

const MAX_RETRIES = 3;

function env(name: "DAYOFF_API_BASE" | "DAYOFF_API_KEY"): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (add it to .env.local)`);
  return v;
}

export async function dayoffGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const base = env("DAYOFF_API_BASE").replace(/\/$/, "");
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "x-api-key": env("DAYOFF_API_KEY"), accept: "application/json" },
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Day Off GET ${path} -> HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      if (!res.ok) throw new Error(`Day Off GET ${path} -> HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastErr ?? new Error(`Day Off GET ${path} failed`);
}

// Recursively strip secret-looking fields before persisting any payload to the
// snapshot (Day Off employee payloads can carry Google OAuth refresh tokens).
const SECRET_KEY_RE = /token|password|secret|refresh/i;

export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) continue;
      out[k] = stripSecrets(v);
    }
    return out as T;
  }
  return value;
}

// Day Off serializes dates inconsistently ("2024-03-01T00:00:00Z" and naive
// "2024-04-10T09:00:00"). Never round-trip through Date() — take the date
// component verbatim.
export function dateOnly(v: string | null | undefined): string | null {
  if (!v || v.length < 10) return null;
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}
