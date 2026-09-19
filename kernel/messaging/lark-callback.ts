// Verifying an inbound Lark callback: decryption, signature, verification
// token, and reading the two payload shapes a card tap can arrive in.
//
// This is separate from lark-card.ts because it is about trusting bytes, not
// about cards: the same check guards any Lark event we ever accept, and a
// verifier that is hard to test is a verifier nobody tests. Everything here is
// pure — it takes the raw body and the headers and returns a verdict — so the
// route stays a thin adapter.

import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

import { type CardActionValue, parseCardValue } from "./lark-card";

export type LarkCallbackHeaders = {
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
};

export function readLarkHeaders(headers: Headers): LarkCallbackHeaders {
  return {
    signature: headers.get("x-lark-signature"),
    timestamp: headers.get("x-lark-request-timestamp"),
    nonce: headers.get("x-lark-request-nonce"),
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would leak the length
  // through an exception; compare lengths first and answer false.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Lark's event encryption: the key is the SHA-256 of the encrypt key, the
 * ciphertext is base64, and its first 16 bytes are the IV.
 */
export function decryptLarkBody(encrypted: string, encryptKey: string): string | null {
  try {
    const key = createHash("sha256").update(encryptKey).digest();
    const buffer = Buffer.from(encrypted, "base64");
    if (buffer.length <= 16) return null;
    const decipher = createDecipheriv("aes-256-cbc", key, buffer.subarray(0, 16));
    return Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("[lark-callback] decrypt failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The v2 event signature: sha256(timestamp + nonce + encrypt_key + raw body). */
export function larkSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  rawBody: string,
): string {
  return createHash("sha256").update(`${timestamp}${nonce}${encryptKey}${rawBody}`).digest("hex");
}

export type LarkCallbackVerdict =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: 401 | 503; reason: string };

/**
 * Verify and unwrap one callback body. Order matters: the signature covers the
 * bytes on the wire, so it is checked against the RAW body before anything is
 * decrypted or parsed, and the verification token is checked against the
 * plaintext afterwards.
 */
export function verifyLarkCallback(rawBody: string, headers: LarkCallbackHeaders): LarkCallbackVerdict {
  const encryptKey = process.env.LARK_ENCRYPT_KEY ?? "";
  const verificationToken = process.env.LARK_VERIFICATION_TOKEN ?? "";
  if (!encryptKey && !verificationToken) {
    return { ok: false, status: 503, reason: "Lark callbacks are not configured." };
  }

  if (encryptKey && headers.signature) {
    if (!headers.timestamp || !headers.nonce) {
      return { ok: false, status: 401, reason: "Signed request without a timestamp or nonce." };
    }
    const expected = larkSignature(headers.timestamp, headers.nonce, encryptKey, rawBody);
    if (!constantTimeEquals(expected, headers.signature)) {
      return { ok: false, status: 401, reason: "Signature mismatch." };
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 401, reason: "Body is not JSON." };
  }

  // An encrypted body carries a single `encrypt` field; everything else is the
  // event itself, which a tenant with encryption switched off posts in clear.
  if (typeof parsed.encrypt === "string") {
    if (!encryptKey) return { ok: false, status: 401, reason: "Encrypted body with no encrypt key." };
    const plaintext = decryptLarkBody(parsed.encrypt, encryptKey);
    if (!plaintext) return { ok: false, status: 401, reason: "Body could not be decrypted." };
    try {
      parsed = JSON.parse(plaintext) as Record<string, unknown>;
    } catch {
      return { ok: false, status: 401, reason: "Decrypted body is not JSON." };
    }
  }

  if (verificationToken && !constantTimeEquals(verificationToken, callbackToken(parsed) ?? "")) {
    return { ok: false, status: 401, reason: "Verification token mismatch." };
  }

  return { ok: true, payload: parsed };
}

/** The token sits at the top level on v1 payloads and under `header` on v2. */
function callbackToken(payload: Record<string, unknown>): string | null {
  if (typeof payload.token === "string") return payload.token;
  const header = payload.header;
  if (header && typeof header === "object" && typeof (header as Record<string, unknown>).token === "string") {
    return (header as Record<string, unknown>).token as string;
  }
  return null;
}

/** Lark's one-time URL check when the callback address is saved. */
export function urlVerificationChallenge(payload: Record<string, unknown>): string | null {
  if (payload.type !== "url_verification") return null;
  return typeof payload.challenge === "string" ? payload.challenge : null;
}

export type CardTap = { openId: string | null; value: CardActionValue };

/**
 * Read a card tap out of a verified payload. Two shapes exist in the wild: the
 * classic card callback posts the operator and the action at the top level,
 * while the 2.0 `card.action.trigger` event nests them under `event`. Both are
 * accepted because which one a tenant sends depends on the card schema, not on
 * anything this code controls.
 */
export function readCardTap(payload: Record<string, unknown>): CardTap | null {
  const event = (payload.event ?? payload) as Record<string, unknown>;
  const action = event.action as Record<string, unknown> | undefined;
  if (!action) return null;
  const value = parseCardValue(action.value);
  if (!value) return null;

  const operator = event.operator as Record<string, unknown> | undefined;
  const openId =
    (typeof operator?.open_id === "string" && operator.open_id) ||
    (typeof event.open_id === "string" && event.open_id) ||
    null;
  return { openId, value };
}
