// Lark tenant-app API client: DMs to team members and Minutes transcript
// pulls for the coaching cycle. Distinct from lib/lark.ts (incoming webhooks
// to group channels) — this one authenticates as the Edge8 Lark app and can
// message individuals and read Minutes.
//
// FAIL-SOFT EVERYWHERE: when LARK_APP_ID / LARK_APP_SECRET are unset, or a
// call fails, or a scope is missing, functions return false/null/[] and log.
// Email remains the delivery guarantee (the cron sends both channels).
//
// Required app scopes (grant in the Lark developer console):
//   im:message              — send DMs
//   contact:user.id:readonly — resolve open_id by email
//   minutes:minutes:readonly — read Minutes meta + transcript
// The Minutes LIST endpoint may be unavailable to tenant apps (v1 hit the
// same wall enumerating wiki children) — listRecentMinutes degrades to [].

const HOST = process.env.LARK_API_HOST || "https://open.larksuite.com";

export function larkConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

let cached: { token: string; expiresAt: number } | null = null;

async function tenantToken(): Promise<string | null> {
  if (!larkConfigured()) return null;
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  try {
    const res = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as { code: number; tenant_access_token?: string; expire?: number; msg?: string };
    if (json.code !== 0 || !json.tenant_access_token) {
      console.error("[lark-api] tenant token failed:", json.code, json.msg);
      return null;
    }
    cached = { token: json.tenant_access_token, expiresAt: Date.now() + (json.expire ?? 3600) * 1000 };
    return cached.token;
  } catch (err) {
    console.error("[lark-api] tenant token error:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function larkFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await tenantToken();
  if (!token) return null;
  try {
    return await fetch(`${HOST}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    console.error(`[lark-api] ${path} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// open_id by email; null when unknown to the tenant.
export async function larkOpenIdByEmail(email: string): Promise<string | null> {
  const res = await larkFetch("/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id", {
    method: "POST",
    body: JSON.stringify({ emails: [email] }),
  });
  if (!res) return null;
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    data?: { user_list?: Array<{ email?: string; user_id?: string }> };
  };
  if (json.code !== 0) {
    console.error("[lark-api] batch_get_id failed:", json.code, json.msg);
    return null;
  }
  return json.data?.user_list?.find((u) => u.user_id)?.user_id ?? null;
}

// Plain-text DM to a team member by email. False (and a log line) on any miss.
export async function sendLarkDm(email: string | null, text: string): Promise<boolean> {
  if (!email || !larkConfigured()) return false;
  const openId = await larkOpenIdByEmail(email);
  if (!openId) {
    console.warn(`[lark-api] no open_id for ${email}; DM skipped`);
    return false;
  }
  const res = await larkFetch("/open-apis/im/v1/messages?receive_id_type=open_id", {
    method: "POST",
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });
  if (!res) return false;
  const json = (await res.json()) as { code: number; msg?: string };
  if (json.code !== 0) {
    console.error("[lark-api] DM failed:", json.code, json.msg);
    return false;
  }
  return true;
}

export type MinutesMeta = { token: string; title: string | null; startTime: string | null };

// The full transcript as plain text; null when the scope/endpoint is missing.
export async function fetchMinutesTranscript(token: string): Promise<string | null> {
  const res = await larkFetch(
    `/open-apis/minutes/v1/minutes/${token}/transcript?need_speaker=true&need_timestamp=false&file_format=txt`,
    { method: "GET" },
  );
  if (!res || !res.ok) {
    if (res) console.error(`[lark-api] transcript ${token} failed: HTTP ${res.status}`);
    return null;
  }
  // Success returns the file stream; error bodies are JSON with a code.
  const text = await res.text();
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as { code?: number; msg?: string };
      if (json.code && json.code !== 0) {
        console.error(`[lark-api] transcript ${token} failed:`, json.code, json.msg);
        return null;
      }
    } catch {
      /* not JSON — treat as transcript text */
    }
  }
  return text.trim() || null;
}

// Best-effort recent-Minutes listing for auto-detection. Tenant apps may not
// have this endpoint at all — in that case (or on any error) return [] and
// the cycle falls back to link-paste tokens.
export async function listRecentMinutes(sinceDays: number): Promise<MinutesMeta[]> {
  const since = Date.now() - sinceDays * 86_400_000;
  const res = await larkFetch(
    `/open-apis/minutes/v1/minutes?start_time=${since}&end_time=${Date.now()}&page_size=50`,
    { method: "GET" },
  );
  if (!res) return [];
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    data?: { minutes?: Array<{ minute_token?: string; title?: string; start_time?: string | number }> };
  };
  if (json.code !== 0 || !json.data?.minutes) {
    if (json.code !== 0) console.warn("[lark-api] minutes list unavailable:", json.code, json.msg);
    return [];
  }
  return json.data.minutes
    .filter((m) => m.minute_token)
    .map((m) => ({
      token: m.minute_token as string,
      title: m.title ?? null,
      startTime: m.start_time != null ? new Date(Number(m.start_time)).toISOString() : null,
    }));
}
