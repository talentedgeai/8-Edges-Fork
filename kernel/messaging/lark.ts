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
/**
 * What a sender can post: plain text, or a Lark interactive card. The card is
 * for reports that carry lists and links (the Daily Check-in), which read as a
 * wall of text in a text message and cannot link anything.
 */
export type LarkMessage = string | { card: Record<string, unknown> };

async function postLark(url: string, message: LarkMessage): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        typeof message === "string"
          ? { msg_type: "text", content: { text: message } }
          : { msg_type: "interactive", card: message.card },
      ),
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
// (LARK_COACHING_WEBHOOK_URL). No-ops when unset. Takes a card as well as
// text since the group-coaching ingest posts a summary with a link, which a
// text message cannot carry.
export async function sendLarkMessage(message: LarkMessage): Promise<boolean> {
  const url = process.env.LARK_COACHING_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_COACHING_WEBHOOK_URL not set; skipping");
    return false;
  }
  return postLark(url, message);
}

// Operations chat (LARK_OPS_WEBHOOK_URL). What belongs here, as Dave set it on
// 2026-09-15: the daily check-in and its reminder, money (orders, payments,
// client invoicing), forms (contact, careers, retreats, surveys), requests
// (time off, hires, work) and the daily digests and QuickBooks syncs. Marketing
// goes to notifyMarketing and coaching to sendLarkMessage: this webhook sat
// unset for months, and the day it was set every marketing notice landed in
// the Operations team chat. No-ops when unset.
export async function notifyOps(message: LarkMessage): Promise<boolean> {
  const url = process.env.LARK_OPS_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_OPS_WEBHOOK_URL not set; skipping ops notice");
    return false;
  }
  return postLark(url, message);
}

// Marketing channel (LARK_MARKETING_WEBHOOK_URL): the per-broadcast summaries,
// the monthly recap, the marketing digest, blog publishing and the writer and
// letter agents' notices. No-ops when unset, so a routine still
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
export async function notifyProduct(message: LarkMessage): Promise<boolean> {
  const url = process.env.LARK_PRODUCT_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_PRODUCT_WEBHOOK_URL not set; skipping product notice");
    return false;
  }
  return postLark(url, message);
}

export async function notifyEo(message: LarkMessage): Promise<boolean> {
  const url = process.env.LARK_EO_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_EO_WEBHOOK_URL not set; skipping EO notice");
    return false;
  }
  return postLark(url, message);
}

// Revenue channel — the month-end revenue digest posts here
// (LARK_REVENUE_WEBHOOK_URL). No-ops when unset, in the same shape as the
// marketing notice: a routine that cannot reach the chat still records a clean
// run, because the digest is a courtesy on top of the nightly snapshot rather
// than the reason the routine exists.
export async function notifyRevenue(text: string): Promise<boolean> {
  const url = process.env.LARK_REVENUE_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_REVENUE_WEBHOOK_URL not set; skipping revenue digest");
    return false;
  }
  return postLark(url, text);
}
