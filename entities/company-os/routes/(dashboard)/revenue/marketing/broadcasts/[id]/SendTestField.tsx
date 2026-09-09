"use client";

import { useState } from "react";
import { sendTest } from "../actions";

// Send a test of the saved broadcast (letter, posts, call to action, footer)
// to one address, beside Save content where the operator expects it. Blank
// sends to the operator's own address. It sends what is saved: the operator
// saves first, then tests.

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;

export function SendTestField({ campaignId, pending, run }: { campaignId: string; pending: boolean; run: Run }) {
  const [to, setTo] = useState("");
  return (
    <>
      <input
        className="admin-input"
        type="email"
        value={to}
        placeholder="test address (blank: you)"
        aria-label="Send test to"
        onChange={(e) => setTo(e.target.value)}
      />
      <button
        type="button"
        className="admin-btn"
        disabled={pending}
        onClick={() => run(() => sendTest(campaignId, to.trim() || undefined), `Test sent to ${to.trim() || "your address"}. It contains what is saved.`)}
      >
        Send test
      </button>
    </>
  );
}
