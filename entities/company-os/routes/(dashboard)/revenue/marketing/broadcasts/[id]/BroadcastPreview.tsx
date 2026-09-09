"use client";

import { useState } from "react";

// The email as an inbox will show it, rendered server-side by the same
// template the send uses (letter, cards in the chosen layout, call to action,
// footer), in a sandboxed frame so nothing in it can run. The plain-text part
// is what text-only clients and inbox summaries read, so it is one tab away.

export function BroadcastPreview({ html, text }: { html: string; text: string }) {
  const [tab, setTab] = useState<"html" | "text">("html");
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Preview</h2>
        <span className="admin-cell-muted u-sm">Rendered from the saved content, posts and call to action. Links carry their tracking codes; the greeting reads as a contact with no first name would see it.</span>
      </div>
      <div className="admin-card-actions u-mb-3">
        <button type="button" className={`admin-btn admin-btn--sm${tab === "html" ? " admin-btn--primary" : ""}`} onClick={() => setTab("html")}>
          HTML
        </button>
        <button type="button" className={`admin-btn admin-btn--sm${tab === "text" ? " admin-btn--primary" : ""}`} onClick={() => setTab("text")}>
          Plain text
        </button>
      </div>
      {tab === "html" ? (
        <iframe className="admin-email-preview" title="Email preview" sandbox="" srcDoc={html} />
      ) : (
        <pre className="u-prewrap admin-cell-muted">{text}</pre>
      )}
    </section>
  );
}
