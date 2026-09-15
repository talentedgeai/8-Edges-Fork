import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `recordAiUsage` reaches Supabase through the routine-run store and `log`
// reaches next/headers; neither is what this file is about, so both are
// replaced. The spies double as the assertion that usage is recorded on every
// path, refusals included — the whole point of funnelling responses through
// one reader is that no call escapes the meter.
const recordAiUsage = vi.fn();
const log = vi.fn();
vi.mock("@/kernel/audit/routine-runs", () => ({ recordAiUsage: (u: unknown) => recordAiUsage(u) }));
vi.mock("@/kernel/config/log", () => ({ log: (...a: unknown[]) => log(...a) }));

const { logAiUsage, readTextOutput } = await import("./response");

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 };

function response(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-x",
    content: [{ type: "text", text: "hello", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: USAGE,
    ...over,
  } as Anthropic.Message;
}

beforeEach(() => {
  recordAiUsage.mockClear();
  log.mockClear();
});

describe("readTextOutput", () => {
  it("returns the first text block on a normal completion", () => {
    expect(readTextOutput("site", "claude-x", response())).toEqual({ ok: true, text: "hello" });
  });

  it("returns the first text block even when a tool_use precedes it", () => {
    const r = response({
      content: [
        { type: "tool_use", id: "tu_1", name: "search", input: {} },
        { type: "text", text: "answer", citations: null },
      ] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({ ok: true, text: "answer" });
  });

  it("refuses on stop_reason refusal, with the caller's message", () => {
    const r = response({ stop_reason: "refusal" });
    expect(readTextOutput("site", "claude-x", r)).toEqual({
      ok: false,
      error: "The model declined this request.",
    });
    expect(readTextOutput("site", "claude-x", r, "Nope.")).toEqual({ ok: false, error: "Nope." });
  });

  it("names max_tokens rather than letting a downstream JSON.parse throw", () => {
    // Truncated JSON downstream reads like an API outage; the cap is the real
    // cause, so it has to be in the stored error.
    const out = readTextOutput("site", "claude-x", response({ stop_reason: "max_tokens" }));
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("max_tokens");
    expect(out.ok === false && out.error).toContain("5 output");
  });

  it("says `?` for the token count when a truncated response carries no usage", () => {
    const r = response({ stop_reason: "max_tokens", usage: undefined as never });
    const out = readTextOutput("site", "claude-x", r);
    expect(out.ok === false && out.error).toContain("after ? output");
  });

  it("refuses when the response carries no text block at all", () => {
    const r = response({
      content: [{ type: "tool_use", id: "tu_1", name: "search", input: {} }] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({
      ok: false,
      error: "Model returned no text output.",
    });
  });

  it("refuses on an empty content array", () => {
    const out = readTextOutput("site", "claude-x", response({ content: [] }));
    expect(out).toEqual({ ok: false, error: "Model returned no text output." });
  });

  it("refuses a text block that is only whitespace", () => {
    const r = response({
      content: [{ type: "text", text: "  \n\t ", citations: null }] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({
      ok: false,
      error: "Model returned no text output.",
    });
  });

  it("returns text untrimmed once it has any non-whitespace", () => {
    const r = response({
      content: [{ type: "text", text: "  padded  ", citations: null }] as Anthropic.Message["content"],
    });
    expect(readTextOutput("site", "claude-x", r)).toEqual({ ok: true, text: "  padded  " });
  });

  it("records and logs usage on every path, refusals included", () => {
    readTextOutput("site", "claude-x", response({ stop_reason: "refusal" }));
    expect(recordAiUsage).toHaveBeenCalledWith(USAGE);
    expect(log).toHaveBeenCalledWith("info", "ai-usage", expect.objectContaining({
      site: "site",
      model: "claude-x",
      in: 10,
      out: 5,
      cache_read: 2,
      cache_write: 0,
    }));
  });
});

describe("logAiUsage", () => {
  it("does nothing at all when there is no usage to report", () => {
    logAiUsage("site", "claude-x", null);
    logAiUsage("site", "claude-x", undefined);
    expect(recordAiUsage).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("defaults the two cache counters to 0 rather than logging null", () => {
    logAiUsage("site", "claude-x", { input_tokens: 1, output_tokens: 2 });
    expect(log).toHaveBeenCalledWith("info", "ai-usage", expect.objectContaining({
      cache_read: 0,
      cache_write: 0,
    }));
  });
});
