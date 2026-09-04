"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveChatPlanAction } from "../../actions";

// In-page chatbot for the "Create a Plan" path. Stateless server (SSE); the
// client holds the Anthropic messages array (echoed from `done`) plus display
// items. When the assistant emits the final ```html brief, we lift it out of the
// transcript into a Save panel that writes it to program_plans via the action.

type CompanyOption = { companyId: string; companyName: string };

type DisplayItem =
  | { kind: "user"; text: string }
  | { kind: "bot"; text: string; streaming?: boolean }
  | { kind: "error"; text: string };

type SseEvent =
  | { type: "text"; text: string }
  | { type: "error"; error: string }
  | { type: "done"; messages: unknown[] };

const KICKOFF = "Let's begin building my AI Program Plan.";
const HTML_BLOCK = /```html\s*([\s\S]*?)```/i;
const HTML_TAIL = /```html[\s\S]*$/i;

// Minimal markdown: **bold**, `code`, "- " bullets, line breaks.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={`${keyBase}-${i}`}>{part.slice(1, -1)}</code>;
    return part;
  });
}

// Keep the raw brief HTML out of the chat bubble: replace a finished block with a
// note, and an in-progress fence tail with an "assembling" note.
function stripBrief(text: string): string {
  if (HTML_BLOCK.test(text)) return text.replace(HTML_BLOCK, "\n(Your AI Program Brief is ready — save it below.)\n");
  if (HTML_TAIL.test(text)) return text.replace(HTML_TAIL, "\n(Assembling your AI Program Brief…)\n");
  return text;
}

function BotText({ text }: { text: string }) {
  const lines = stripBrief(text).split("\n");
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flush = (key: string) => {
    if (list.length) {
      out.push(<ul key={key}>{list}</ul>);
      list = [];
    }
  };
  lines.forEach((line, i) => {
    if (/^\s*[-*] /.test(line)) list.push(<li key={`li-${i}`}>{renderInline(line.replace(/^\s*[-*] /, ""), `l${i}`)}</li>);
    else {
      flush(`ul-${i}`);
      if (line.trim()) out.push(<p key={`p-${i}`}>{renderInline(line, `t${i}`)}</p>);
    }
  });
  flush("ul-end");
  return <>{out}</>;
}

export function PlanChat({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [planName, setPlanName] = useState("AI Program Plan");
  const [companyId, setCompanyId] = useState(companies[0]?.companyId ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, brief]);

  const runRequest = useCallback(async (nextMessages: unknown[]): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch("/api/portal/program-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok || !res.body) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        setItems((prev) => [...prev, { kind: "error", text: errBody?.error ?? `Request failed (${res.status})` }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const handle = (event: SseEvent) => {
        if (event.type === "text") {
          setItems((prev) => {
            const last = prev[prev.length - 1];
            if (last?.kind === "bot" && last.streaming) return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
            return [...prev, { kind: "bot", text: event.text, streaming: true }];
          });
        } else if (event.type === "error") {
          setItems((prev) => [...prev, { kind: "error", text: event.error }]);
        } else if (event.type === "done") {
          setMessages(event.messages);
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                handle(JSON.parse(line.slice(6)) as SseEvent);
              } catch {
                // skip malformed frame
              }
            }
          }
        }
      }
    } catch {
      setItems((prev) => [...prev, { kind: "error", text: "Could not reach the assistant. Try again." }]);
    } finally {
      // Finalize streaming flags and lift any completed brief out of the tail.
      setItems((prev) => {
        const next = prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it));
        const lastBot = [...next].reverse().find((it) => it.kind === "bot") as Extract<DisplayItem, { kind: "bot" }> | undefined;
        const match = lastBot?.text.match(HTML_BLOCK);
        if (match) setBrief(match[1].trim());
        return next;
      });
      setPending(false);
    }
  }, []);

  // Kick the conversation off once: the assistant opens with a welcome + the
  // first Activity 1 question. The kickoff user turn is not shown.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runRequest([{ role: "user", content: KICKOFF }]);
  }, [runRequest]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setItems((prev) => [...prev, { kind: "user", text }]);
    void runRequest([...messages, { role: "user", content: text }]);
  }

  async function save() {
    if (!brief || saving) return;
    setSaveError(null);
    if (!planName.trim()) {
      setSaveError("Give your program a name.");
      return;
    }
    setSaving(true);
    const r = await saveChatPlanAction({ companyId: companyId || undefined, name: planName.trim(), briefHtml: brief });
    if (!r.ok) {
      setSaveError(r.error);
      setSaving(false);
      return;
    }
    router.push(`/portal/programs/${r.programId}`);
  }

  return (
    <div>
      <div
        ref={scrollRef}
        className="admin-card admin-section-card admin-scroll-vh u-stack u-gap-3"
      >
        {items.length === 0 && pending && <div className="admin-cell-muted">Starting…</div>}
        {items.map((item, i) => {
          if (item.kind === "user") {
            return (
              <div key={i} className="admin-chat-bubble admin-chat-bubble--me">
                {item.text}
              </div>
            );
          }
          if (item.kind === "bot") {
            return (
              <div key={i} className="admin-chat-bubble">
                <BotText text={item.text} />
              </div>
            );
          }
          return (
            <div key={i} className="admin-alert admin-alert--err">{item.text}</div>
          );
        })}
        {pending && items.length > 0 && <div className="admin-cell-muted">Thinking…</div>}
      </div>

      {brief && (
        <div className="admin-card admin-section-card admin-card--ok u-mt-4">
          <h2 className="admin-card-title u-mb-2">Your AI Program Brief is ready</h2>
          <label className="admin-label" htmlFor="plan-name">Program name</label>
          <input
            id="plan-name"
            className="admin-input"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            disabled={saving}
          />
          {companies.length > 1 && (
            <div className="u-mt-3">
              <label className="admin-label" htmlFor="plan-company">Company</label>
              <select id="plan-company" className="admin-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={saving}>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>{c.companyName}</option>
                ))}
              </select>
            </div>
          )}
          {saveError && <div className="admin-alert admin-alert--err u-mt-3">{saveError}</div>}
          <div className="u-mt-4">
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save this plan"}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="u-row u-mt-4">
        <input
          className="admin-input u-grow"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer…"
          disabled={pending}
          aria-label="Message the plan assistant"
        />
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
