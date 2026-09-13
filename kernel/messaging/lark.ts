// Lark webhook notifications.

/**
 * Post one text message to a Lark custom-bot webhook. Returns whether Lark
 * accepted it.
 *
 * The return value exists because a Lark webhook answers a rejected message
 * with HTTP 200 and a non-zero `code` in the body — a missing bot, a revoked
 * webhook and a wrong signature all look like a clean send to anything that
 * only awaits the fetch. The Daily Check-in Agent ran "ok" for three mornings
 * on that basis while nothing reached either chat (2026-09-11), so the body is
 * now read and a rejection is both logged and reported to the caller.
 */
async function postLark(url: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error(`[lark] send rejected: HTTP ${res.status} ${raw.slice(0, 200)}`);
      return false;
    }
    // Lark answers `{"code":0,"msg":"success"}`; older deployments answer
    // `{"StatusCode":0,...}`. Either zero means delivered. A body we cannot
    // parse is not treated as a failure — the known rejection shape is JSON,
    // and failing on an unreadable 200 would block sends on a format change.
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.warn(`[lark] send returned a non-JSON body: ${raw.slice(0, 200)}`);
      return true;
    }
    const code = typeof body?.code === "number" ? body.code : body?.StatusCode;
    if (typeof code === "number" && code !== 0) {
      console.error(`[lark] send rejected: code ${code} ${String(body?.msg ?? body?.StatusMessage ?? "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[lark] send failed", err);
    return false;
  }
}

// Coaching channel — reuses the CAIO Coach incoming webhook
// (LARK_COACHING_WEBHOOK_URL). No-ops when unset.
export async function sendLarkMessage(text: string): Promise<boolean> {
  const url = process.env.LARK_COACHING_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_COACHING_WEBHOOK_URL not set; skipping");
    return false;
  }
  return postLark(url, text);
}

// Operations channel — every site form submission pings here
// (LARK_OPS_WEBHOOK_URL). No-ops when unset.
export async function notifyOps(text: string): Promise<boolean> {
  const url = process.env.LARK_OPS_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_OPS_WEBHOOK_URL not set; skipping ops notice");
    return false;
  }
  return postLark(url, text);
}

// Marketing channel — the per-broadcast summaries and the monthly recap post
// here (LARK_MARKETING_WEBHOOK_URL). No-ops when unset, so a routine still
// records a clean run before the webhook is configured.
export async function notifyMarketing(text: string): Promise<boolean> {
  const url = process.env.LARK_MARKETING_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_MARKETING_WEBHOOK_URL not set; skipping marketing notice");
    return false;
  }
  return postLark(url, text);
}

// The product-team chat and the community chat — the Daily Check-in Agent's
// two destinations (LARK_PRODUCT_WEBHOOK_URL, LARK_EO_WEBHOOK_URL). An unset
// variable returns false rather than no-opping quietly: the check-in run turns
// that into a failed run naming the roster, because a check-in nobody receives
// is not a check-in.
export async function notifyProduct(text: string): Promise<boolean> {
  const url = process.env.LARK_PRODUCT_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_PRODUCT_WEBHOOK_URL not set; skipping product notice");
    return false;
  }
  return postLark(url, text);
}

export async function notifyEo(text: string): Promise<boolean> {
  const url = process.env.LARK_EO_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_EO_WEBHOOK_URL not set; skipping EO notice");
    return false;
  }
  return postLark(url, text);
}
