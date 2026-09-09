"use client";

import { useState } from "react";

// Renders a saved 5Ds brief. The HTML is model-generated and self-contained, so
// it displays in a sandboxed iframe with NO scripts allowed; download rebuilds
// it as a local .html file.
export function BriefViewer({ html, title }: { html: string; title: string }) {
  const [open, setOpen] = useState(false);

  function download() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9._-]+/g, "_") || "ai-program-brief"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="u-row">
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide brief" : "View brief"}
        </button>
        <button type="button" className="admin-btn admin-btn--sm" onClick={download}>
          Download HTML
        </button>
      </div>
      {open && (
        <iframe
          title={title}
          sandbox=""
          srcDoc={html}
          className="admin-frame u-mt-3"
        />
      )}
    </div>
  );
}
