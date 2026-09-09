import { beforeEach, describe, expect, it, vi } from "vitest";

// What is pinned here is which bytes reach company_os.interactions.
//
// `logBody` exists because some transactional emails carry a secret — a temp
// password, a one-time verify link. When it is passed, that string is stored
// INSTEAD of the rendered html, so the secret never lands in the CRM timeline
// where every admin can read it. A regression here is silent: the email still
// sends, the log row still appears, and the secret is simply sitting in it.
//
// The client is built from RESEND_API_KEY at module load, so the env and the
// mocks are in place before the dynamic import.

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => send(...a) };
  },
}));

const inserted: Record<string, unknown>[] = [];
const peopleRow: { id: string } | null = { id: "person-1" };
vi.mock("@/kernel/data/supabase", () => {
  const builder = (table: string) => ({
    select: () => builder(table),
    eq: () => builder(table),
    is: () => builder(table),
    maybeSingle: async () => ({ data: peopleRow, error: null }),
    insert: async (row: Record<string, unknown>) => {
      inserted.push(row);
      return { error: null };
    },
  });
  return { companyOs: { from: (table: string) => builder(table) } };
});

process.env.RESEND_API_KEY = "re_test_key_not_real";

const { sendTransactionalEmail } = await import("./email");

const HTML = "<p>Your temporary password is hunter2</p>";

beforeEach(() => {
  inserted.length = 0;
  send.mockReset();
  send.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

describe("sendTransactionalEmail — what gets persisted", () => {
  it("stores logBody instead of the html when logBody is given", async () => {
    const ok = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Your account",
      html: HTML,
      logBody: "Temporary password email (body withheld).",
    });

    expect(ok).toBe(true);
    // The email itself still carries the real html…
    expect(send.mock.calls[0][0].html).toBe(HTML);
    // …but the CRM row must not.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].body).toBe("Temporary password email (body withheld).");
    expect(JSON.stringify(inserted[0])).not.toContain("hunter2");
  });

  it("stores the html when no logBody is given", async () => {
    // The default is deliberate: an ordinary transactional email is meant to be
    // readable on the contact's timeline. `logBody` is the opt-out, so any
    // email carrying a secret has to pass it.
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: "<p>plain</p>" });
    expect(inserted[0].body).toBe("<p>plain</p>");
  });

  it("stores an empty logBody rather than falling back to the html", async () => {
    // `??`, not `||` — an empty string is a deliberate "log nothing", and a
    // fallback here would put the secret back.
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: HTML, logBody: "" });
    expect(inserted[0].body).toBe("");
  });

  it("writes one row per recipient, each lowercased and trimmed", async () => {
    await sendTransactionalEmail({
      to: [" A@Example.com ", "b@example.com"],
      subject: "Hi",
      html: "<p>x</p>",
      logMeta: { source: "test" },
    });
    expect(inserted).toHaveLength(2);
    expect((inserted[0].metadata as Record<string, unknown>).to).toBe("a@example.com");
    expect((inserted[1].metadata as Record<string, unknown>).to).toBe("b@example.com");
    // logMeta rides along without displacing the fixed fields.
    expect(inserted[0].metadata).toMatchObject({ source: "test", format: "html" });
    expect(inserted[0].kind).toBe("email");
  });

  it("persists nothing at all when Resend rejects the send", async () => {
    send.mockResolvedValue({ data: null, error: { message: "nope" } });
    const ok = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hi",
      html: HTML,
      logBody: "withheld",
    });
    expect(ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("sends with the default sender unless `from` overrides it", async () => {
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: "<p>x</p>" });
    expect(send.mock.calls[0][0].from).toBe("Arca Wellness <derek.nguyen@edge8.ai>");

    await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hi",
      html: "<p>x</p>",
      from: "Dave <derek.nguyen@edge8.ai>",
    });
    expect(send.mock.calls[1][0].from).toBe("Dave <derek.nguyen@edge8.ai>");
  });

  it("omits replyTo entirely rather than sending it undefined", async () => {
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: "<p>x</p>" });
    expect("replyTo" in send.mock.calls[0][0]).toBe(false);
  });
});
