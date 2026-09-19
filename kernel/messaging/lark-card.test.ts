import { describe, expect, it, vi } from "vitest";

import {
  buildCommitmentCard,
  cardHandlerFor,
  parseCardValue,
  registerCardHandler,
} from "./lark-card";
import { decryptLarkBody, larkSignature, readCardTap } from "./lark-callback";
import { sendLarkCard } from "./lark-api";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

describe("buildCommitmentCard", () => {
  it("keeps at most five context lines and one action block per row", () => {
    const card = buildCommitmentCard({
      title: "Your 1-1",
      lines: ["a", "b", "c", "d", "e", "f"],
      rows: [
        {
          id: "c1",
          text: "Ship the pricing page",
          actions: [
            { label: "Done", value: { kind: "coaching-commitment", commitmentId: "c1", status: "done" } },
            { label: "Blocked", value: { kind: "coaching-commitment", commitmentId: "c1", status: "blocked" } },
          ],
        },
      ],
    });

    const elements = card.elements as Record<string, unknown>[];
    const divs = elements.filter((e) => e.tag === "div");
    // Five context lines plus the row's own line.
    expect(divs).toHaveLength(6);
    const actions = elements.find((e) => e.tag === "action") as { actions: unknown[] };
    expect(actions.actions).toHaveLength(2);
    expect((card.header as { title: { content: string } }).title.content).toBe("Your 1-1");
  });
});

describe("parseCardValue", () => {
  it("rejects a value without a kind and keeps the string fields of one with it", () => {
    expect(parseCardValue({ commitmentId: "c1" })).toBeNull();
    expect(parseCardValue("nope")).toBeNull();
    expect(parseCardValue({ kind: "coaching-commitment", commitmentId: "c1", n: 3 })).toEqual({
      kind: "coaching-commitment",
      commitmentId: "c1",
    });
  });
});

describe("the handler registry", () => {
  it("returns the registered handler and null for an unknown kind", async () => {
    const handler = vi.fn(async () => ({}));
    registerCardHandler("test-kind", handler);
    expect(cardHandlerFor("test-kind")).toBe(handler);
    expect(cardHandlerFor("no-such-kind")).toBeNull();
  });
});

describe("readCardTap", () => {
  it("reads the classic top-level shape and the 2.0 nested one", () => {
    const value = { kind: "coaching-commitment", commitmentId: "c1", status: "done" };
    expect(readCardTap({ open_id: "ou_1", action: { value } })).toEqual({ openId: "ou_1", value });
    expect(readCardTap({ schema: "2.0", event: { operator: { open_id: "ou_2" }, action: { value } } })).toEqual({
      openId: "ou_2",
      value,
    });
    expect(readCardTap({ open_id: "ou_1" })).toBeNull();
  });
});

describe("decryptLarkBody", () => {
  it("round-trips Lark's AES-256-CBC scheme and answers null on garbage", () => {
    const encryptKey = "encrypt-key";
    const plaintext = JSON.stringify({ hello: "world" });
    const key = createHash("sha256").update(encryptKey).digest();
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const body = Buffer.concat([iv, cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64");

    expect(decryptLarkBody(body, encryptKey)).toBe(plaintext);
    expect(decryptLarkBody(body, "wrong-key")).not.toBe(plaintext);
    expect(decryptLarkBody("aGk=", encryptKey)).toBeNull();
  });
});

describe("larkSignature", () => {
  it("hashes timestamp, nonce, key and body in that order", () => {
    const expected = createHash("sha256").update("1t2nkeybody").digest("hex");
    expect(larkSignature("1t", "2n", "key", "body")).toBe(expected);
  });
});

describe("sendLarkCard", () => {
  it("posts an interactive message to the open_id behind the email", async () => {
    vi.stubEnv("LARK_APP_ID", "id");
    vi.stubEnv("LARK_APP_SECRET", "secret");
    const posted: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        posted.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.includes("tenant_access_token")) {
          return new Response(JSON.stringify({ code: 0, tenant_access_token: "t", expire: 7200 }));
        }
        if (url.includes("batch_get_id")) {
          return new Response(JSON.stringify({ code: 0, data: { user_list: [{ user_id: "ou_1" }] } }));
        }
        return new Response(JSON.stringify({ code: 0 }));
      }),
    );

    const card = buildCommitmentCard({ title: "t", lines: [], rows: [] });
    expect(await sendLarkCard("member@example.test", card)).toBe(true);
    const message = posted.at(-1)?.body as { msg_type: string; receive_id: string };
    expect(message.msg_type).toBe("interactive");
    expect(message.receive_id).toBe("ou_1");

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
