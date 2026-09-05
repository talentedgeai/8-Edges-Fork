"use client";

// Team portal assistant: floating button + right slide-in panel, mounted in
// app/team/(dashboard)/layout.tsx so it is available on every /team page.
// Reuses the admin drawer's backdrop/slide conventions and the shared chatw-*
// styles from admin.css (which the /team layout imports).
//
// Answer-only: unlike the admin widget there are no approval cards or write
// actions. The server is stateless — we hold the Anthropic messages array
// (opaque JSON echoed from the route's `done` event) plus render-friendly
// display items, both persisted to sessionStorage so a reload keeps the chat.

import { useCallback, useEffect, useRef, useState } from "react";
import { BotText, ConversationHistory, type LoadedConversation } from "@/entities/assistant/client";

type DisplayItem =
  | { kind: "user"; text: string }
  | { kind: "bot"; text: string; streaming?: boolean }
  | { kind: "tool"; detail: string }
  | { kind: "error"; text: string };

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "error"; error: string }
  | { type: "done"; messages: unknown[]; conversationId?: string | null; title?: string | null };

const STORAGE_KEY = "edge8-team-chat";

// Restore persisted chat from sessionStorage. Runs as a lazy useState
// initializer (client-only via the window guard). Safe against hydration
// mismatch because the panel is closed on first render, so restored content is
// never in the server-rendered HTML.
function loadSaved(): { items: DisplayItem[]; messages: unknown[]; conversationId: string | null } {
  if (typeof window === "undefined") return { items: [], messages: [], conversationId: null };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], messages: [], conversationId: null };
    const saved = JSON.parse(raw) as {
      items?: DisplayItem[];
      messages?: unknown[];
      conversationId?: string | null;
    };
    const items = (saved.items ?? []).map((it) =>
      it.kind === "bot" ? { ...it, streaming: false } : it,
    );
    return { items, messages: saved.messages ?? [], conversationId: saved.conversationId ?? null };
  } catch {
    return { items: [], messages: [], conversationId: null };
  }
}

export function TeamChatWidget() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DisplayItem[]>(() => loadSaved().items);
  const [messages, setMessages] = useState<unknown[]>(() => loadSaved().messages);
  const [conversationId, setConversationId] = useState<string | null>(
    () => loadSaved().conversationId,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist the ACTIVE conversation so a full page reload restores it instantly
  // (the DB is the source of truth for the list + cross-device loads).
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items, messages, conversationId }));
    } catch {
      // storage full: chat still works, just won't survive a reload
    }
  }, [items, messages, conversationId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, open]);

  const runTurn = useCallback(
    async (text: string) => {
      const nextItems: DisplayItem[] = [...items, { kind: "user", text }];
      setItems(nextItems);
      const outgoing = [...messages, { role: "user", content: text }];
      setPending(true);
      try {
        const res = await fetch("/api/team/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: outgoing, conversationId, displayItems: nextItems }),
        });
        if (!res.ok || !res.body) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          setItems((prev) => [
            ...prev,
            { kind: "error", text: errBody?.error ?? `Request failed (${res.status})` },
          ]);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let gotDone = false;

        const handle = (event: SseEvent) => {
          if (event.type === "text") {
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last?.kind === "bot" && last.streaming) {
                return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
              }
              return [...prev, { kind: "bot", text: event.text, streaming: true }];
            });
          } else if (event.type === "tool") {
            setItems((prev) => [
              ...prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)),
              { kind: "tool", detail: event.detail },
            ]);
          } else if (event.type === "error") {
            setItems((prev) => [...prev, { kind: "error", text: event.error }]);
          } else if (event.type === "done") {
            gotDone = true;
            setMessages(event.messages);
            if (event.conversationId) setConversationId(event.conversationId);
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
        if (!gotDone) {
          setItems((prev) => [...prev, { kind: "error", text: "Response interrupted. Try again." }]);
        }
      } catch {
        setItems((prev) => [
          ...prev,
          { kind: "error", text: "Could not reach the assistant. Try again." },
        ]);
      } finally {
        setItems((prev) => prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)));
        setPending(false);
      }
    },
    [items, messages, conversationId],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    void runTurn(text);
  }

  // Open a saved conversation from the history list: hydrate the transcript +
  // display items (the DB is the source of truth) and return to the chat view.
  const handleSelect = useCallback((conv: LoadedConversation) => {
    setItems(
      (conv.display_items as DisplayItem[]).map((it) =>
        it.kind === "bot" ? { ...it, streaming: false } : it,
      ),
    );
    setMessages(conv.messages);
    setConversationId(conv.id);
    setShowHistory(false);
  }, []);

  function newChat() {
    setItems([]);
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <button
        type="button"
        className="admin-chat-fab"
        aria-label="Open team assistant"
        onClick={() => setOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 12c0 4.418-4.03 8-9 8-1.02 0-2-.15-2.91-.43L4 21l1.02-3.4C3.77 16.2 3 14.19 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 12h.01M12 12h.01M15.5 12h.01"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="chatw-portal">
          <button
            type="button"
            aria-label="Close"
            className="admin-drawer-backdrop"
            onClick={() => setOpen(false)}
          />
          <aside className="admin-drawer admin-chat-panel" role="dialog" aria-label="Team assistant">
            <div className="admin-drawer-head">
              <div>
                <div className="admin-drawer-eyebrow brand-label">8 Edges Team</div>
                <h2 className="admin-drawer-title">Assistant</h2>
              </div>
              <div className="admin-chat-head-actions">
                <button
                  type="button"
                  className={`admin-chat-history-btn${showHistory ? " admin-chat-history-btn--active" : ""}`}
                  aria-pressed={showHistory}
                  onClick={() => setShowHistory((v) => !v)}
                >
                  {showHistory ? "Back" : "History"}
                </button>
                {(items.length > 0 || conversationId) && (
                  <button type="button" className="admin-chat-newchat" onClick={newChat}>
                    New chat
                  </button>
                )}
                <button
                  type="button"
                  className="admin-drawer-close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>

            {showHistory ? (
              <ConversationHistory
                surface="team"
                activeId={conversationId}
                onSelect={handleSelect}
                emptyHint="No saved conversations yet. Start chatting and they'll show up here."
              />
            ) : (
              <>
                <div className="admin-chat-msgs" ref={scrollRef}>
                  {items.length === 0 && (
                    <div className="admin-chat-empty">
                      <p>Ask me anything about Edge8:</p>
                      <ul>
                        <li>What&apos;s our time-off policy?</li>
                        <li>Who&apos;s out on vacation next week?</li>
                        <li>Who&apos;s in the design team, and who do they report to?</li>
                        <li>How much revenue have we invoiced this quarter?</li>
                        <li>Which clients do we work with?</li>
                      </ul>
                      <p className="admin-chat-empty-note">
                        Read-only. I look things up but never change anything, and I can&apos;t see
                        payroll or private personal data.
                      </p>
                    </div>
                  )}

                  {items.map((item, i) => {
                    if (item.kind === "user") {
                      return (
                        <div key={i} className="admin-chat-msg admin-chat-msg--user">
                          {item.text}
                        </div>
                      );
                    }
                    if (item.kind === "bot") {
                      return (
                        <div key={i} className="admin-chat-msg admin-chat-msg--bot">
                          <BotText text={item.text} />
                        </div>
                      );
                    }
                    if (item.kind === "tool") {
                      return (
                        <div key={i} className="admin-chat-toolchip" title={item.detail}>
                          Looked it up
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="admin-chat-msg admin-chat-msg--error">
                        {item.text}
                      </div>
                    );
                  })}

                  {pending && <div className="admin-chat-typing">Thinking…</div>}
                </div>

                <form className="admin-chat-composer" onSubmit={onSubmit}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about Edge8…"
                    disabled={pending}
                    aria-label="Message the team assistant"
                  />
                  <button type="submit" className="admin-chat-send" disabled={pending || !input.trim()}>
                    Send
                  </button>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
