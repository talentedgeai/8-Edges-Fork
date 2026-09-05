"use client";

// Admin database assistant: floating button + right slide-in panel, mounted in
// app/admin/(dashboard)/layout.tsx so it is available on every admin page.
// Reuses the admin drawer's backdrop/slide conventions (Escape/backdrop close,
// body scroll lock).
//
// The server is stateless: we hold the Anthropic messages array (opaque JSON
// echoed from the route's `done` event) plus render-friendly display items,
// both persisted to sessionStorage so a full page reload keeps the chat.

import { useCallback, useEffect, useRef, useState } from "react";
import { BotText, ConversationHistory, type LoadedConversation } from "@/entities/assistant/client";

type ApprovalStatus = "pending" | "approved" | "declined";

type DisplayItem =
  | { kind: "user"; text: string }
  | { kind: "bot"; text: string; streaming?: boolean }
  | { kind: "tool"; detail: string; name?: string }
  | {
      kind: "approval";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: ApprovalStatus;
    }
  | { kind: "error"; text: string };

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "approval"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; error: string }
  | { type: "done"; messages: unknown[]; conversationId?: string | null; title?: string | null };

const STORAGE_KEY = "edge8-admin-chat";

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

const CHIP_LABELS: Record<string, string> = {
  execute_write: "Changed the database",
  send_email: "Sent the email",
  invite_portal_member: "Portal access provisioned",
};

// Approval card for a pending execute_write / send_email tool call. Nothing
// runs server-side until Approve is clicked.
function ApprovalCard({
  item,
  disabled,
  onDecide,
}: {
  item: Extract<DisplayItem, { kind: "approval" }>;
  disabled: boolean;
  onDecide: (id: string, approved: boolean) => void;
}) {
  const isEmail = item.name === "send_email";
  const isPortal = item.name === "invite_portal_member";
  const statusLabel =
    item.status === "approved" ? "Approved" : item.status === "declined" ? "Cancelled" : null;
  return (
    <div className="admin-chat-approval">
      <div className="admin-chat-approval-title">
        {isEmail
          ? "Send this email?"
          : isPortal
            ? item.input.action === "resend_link"
              ? "Send a fresh portal sign-in link?"
              : "Send this portal invite?"
            : "Run this change?"}
      </div>
      {isEmail ? (
        <div className="admin-chat-approval-email">
          <div>
            <span className="admin-chat-approval-label">To</span> {String(item.input.to ?? "")}
          </div>
          <div>
            <span className="admin-chat-approval-label">Subject</span>{" "}
            {String(item.input.subject ?? "")}
          </div>
          <pre>{String(item.input.body ?? "")}</pre>
        </div>
      ) : isPortal ? (
        <div className="admin-chat-approval-email">
          <div>{String(item.input.summary ?? "")}</div>
        </div>
      ) : (
        <pre className="admin-chat-approval-sql">{String(item.input.sql ?? "")}</pre>
      )}
      {statusLabel ? (
        <div
          className={`admin-chat-approval-status chatw-approval-status--${item.status}`}
        >
          {statusLabel}
        </div>
      ) : (
        <div className="admin-chat-approval-actions">
          <button
            type="button"
            className="admin-chat-approve"
            disabled={disabled}
            onClick={() => onDecide(item.id, true)}
          >
            {isEmail || isPortal ? "Approve & send" : "Approve & run"}
          </button>
          <button
            type="button"
            className="admin-chat-decline"
            disabled={disabled}
            onClick={() => onDecide(item.id, false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminChatWidget({ canWrite = false }: { canWrite?: boolean }) {
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

  // Shared POST + SSE pump for both new user turns and approval decisions.
  // Returns whether the stream completed (reached `done`).
  const runRequest = useCallback(
    async (payload: {
      messages: unknown[];
      decision?: { toolUseId: string; approved: boolean };
      displayItems: DisplayItem[];
    }): Promise<boolean> => {
      setPending(true);
      try {
        const res = await fetch("/api/admin/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, conversationId }),
        });
        if (!res.ok || !res.body) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          setItems((prev) => [
            ...prev,
            { kind: "error", text: errBody?.error ?? `Request failed (${res.status})` },
          ]);
          return false;
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
              { kind: "tool", detail: event.detail, name: event.name },
            ]);
          } else if (event.type === "approval") {
            setItems((prev) => [
              ...prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)),
              {
                kind: "approval",
                id: event.id,
                name: event.name,
                input: event.input,
                status: "pending",
              },
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
        return gotDone;
      } catch {
        setItems((prev) => [
          ...prev,
          { kind: "error", text: "Could not reach the assistant. Try again." },
        ]);
        return false;
      } finally {
        setItems((prev) => prev.map((it) => (it.kind === "bot" ? { ...it, streaming: false } : it)));
        setPending(false);
      }
    },
    [conversationId],
  );

  const runTurn = useCallback(
    (text: string) => {
      const nextItems: DisplayItem[] = [...items, { kind: "user", text }];
      setItems(nextItems);
      void runRequest({
        messages: [...messages, { role: "user", content: text }],
        displayItems: nextItems,
      });
    },
    [items, messages, runRequest],
  );

  // Approve/Cancel a pending write or email. Optimistically resolve the card;
  // if the request never completes, put it back so the action can be retried.
  const decide = useCallback(
    async (id: string, approved: boolean) => {
      const status = approved ? ("approved" as const) : ("declined" as const);
      const nextItems = items.map((it) =>
        it.kind === "approval" && it.id === id ? { ...it, status } : it,
      );
      setItems(nextItems);
      const ok = await runRequest({
        messages,
        decision: { toolUseId: id, approved },
        displayItems: nextItems,
      });
      if (!ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "approval" && it.id === id ? { ...it, status: "pending" } : it,
          ),
        );
      }
    },
    [items, messages, runRequest],
  );

  const hasPendingApproval = items.some(
    (it) => it.kind === "approval" && it.status === "pending",
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending || hasPendingApproval) return;
    setInput("");
    runTurn(text);
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
        aria-label="Open admin assistant"
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
          <aside className="admin-drawer admin-chat-panel" role="dialog" aria-label="Admin assistant">
            <div className="admin-drawer-head">
              <div>
                <div className="admin-drawer-eyebrow brand-label">8 Edges</div>
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
                surface="admin"
                activeId={conversationId}
                onSelect={handleSelect}
                emptyHint="No saved conversations yet. Start chatting and they'll show up here."
              />
            ) : (
              <>
                <div className="admin-chat-msgs" ref={scrollRef}>
                  {items.length === 0 && (
                    <div className="admin-chat-empty">
                      <p>Ask anything about the Company OS data:</p>
                      <ul>
                        <li>How many open deals do we have, and what is their total USD value?</li>
                        <li>Which job requisitions are open and how many applicants each?</li>
                        <li>Who is on vacation next week?</li>
                        <li>Top 5 unpaid invoices by balance.</li>
                      </ul>
                      <p className="admin-chat-empty-note">
                        {canWrite
                          ? "It can also update records and send emails — every change and every email needs your approval first."
                          : "Read-only. The assistant never changes data."}
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
                          {CHIP_LABELS[item.name ?? ""] ?? "Queried the database"}
                        </div>
                      );
                    }
                    if (item.kind === "approval") {
                      return (
                        <ApprovalCard key={i} item={item} disabled={pending} onDecide={decide} />
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
                    placeholder={
                      hasPendingApproval
                        ? "Approve or cancel the pending action first…"
                        : "Ask about the business…"
                    }
                    disabled={pending || hasPendingApproval}
                    aria-label="Message the admin assistant"
                  />
                  <button
                    type="submit"
                    className="admin-chat-send"
                    disabled={pending || hasPendingApproval || !input.trim()}
                  >
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
