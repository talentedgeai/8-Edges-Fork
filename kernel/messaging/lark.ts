// Lark webhook notifications.

async function postLark(url: string, text: string): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
    });
  } catch (err) {
    console.error("[lark] send failed", err);
  }
}

// Coaching channel — reuses the CAIO Coach incoming webhook
// (LARK_COACHING_WEBHOOK_URL). No-ops silently when unset.
export async function sendLarkMessage(text: string): Promise<void> {
  const url = process.env.LARK_COACHING_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_COACHING_WEBHOOK_URL not set; skipping");
    return;
  }
  await postLark(url, text);
}

// Operations channel — every site form submission pings here
// (LARK_OPS_WEBHOOK_URL). No-ops silently when unset.
export async function notifyOps(text: string): Promise<void> {
  const url = process.env.LARK_OPS_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_OPS_WEBHOOK_URL not set; skipping ops notice");
    return;
  }
  await postLark(url, text);
}

// ── Direct messages to a person (requires a Lark custom app) ────────────────
// Needs LARK_APP_ID + LARK_APP_SECRET: an internal Lark app with the im:message
// scope, published to the workspace. No-ops silently when unset, so features
// that call it keep working before the app is configured. LARK_API_BASE defaults
// to Lark Suite (international); set it to https://open.feishu.cn for Feishu.
const LARK_API_BASE = process.env.LARK_API_BASE || "https://open.larksuite.com";

async function larkTenantToken(): Promise<string | null> {
  const app_id = process.env.LARK_APP_ID;
  const app_secret = process.env.LARK_APP_SECRET;
  if (!app_id || !app_secret) return null;
  try {
    const res = await fetch(`${LARK_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id, app_secret }),
    });
    const json = (await res.json()) as { code?: number; tenant_access_token?: string };
    if (json.code !== 0 || !json.tenant_access_token) {
      console.error("[lark] tenant token failed", json.code);
      return null;
    }
    return json.tenant_access_token;
  } catch (err) {
    console.error("[lark] tenant token error", err);
    return null;
  }
}

// DM a person by their Lark email. Best-effort: returns false and logs on any
// failure, never throws. No-ops when the Lark app credentials are unset.
export async function sendLarkDirectMessage(email: string, text: string): Promise<boolean> {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
    console.warn("[lark] LARK_APP_ID/SECRET not set; skipping direct message");
    return false;
  }
  if (!email) return false;
  const token = await larkTenantToken();
  if (!token) return false;
  try {
    const res = await fetch(`${LARK_API_BASE}/open-apis/im/v1/messages?receive_id_type=email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: email, msg_type: "text", content: JSON.stringify({ text }) }),
    });
    const json = (await res.json()) as { code?: number; msg?: string };
    if (json.code !== 0) {
      console.error("[lark] DM failed", json.code, json.msg);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[lark] DM error", err);
    return false;
  }
}
