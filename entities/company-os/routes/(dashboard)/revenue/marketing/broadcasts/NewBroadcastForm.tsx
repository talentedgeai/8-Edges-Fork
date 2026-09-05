"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBroadcast } from "./actions";

export function NewBroadcastForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBroadcast({ name, subject });
      if (result.ok) {
        router.push(`/admin/revenue/marketing/broadcasts/${result.id}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="admin-form u-mt-3">
      <div className="admin-field">
        <label className="admin-label" htmlFor="campaign-name">
          Internal name
        </label>
        <input
          id="campaign-name"
          className="admin-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="August newsletter"
        />
        <div className="admin-hint">Only you see this. It never appears in the email.</div>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="campaign-subject">
          Subject line
        </label>
        <input
          id="campaign-subject"
          className="admin-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What we learned running 40 AI workshops"
        />
      </div>
      {error && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {error}
        </div>
      )}
      <div className="admin-form-actions">
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={submit}
          disabled={pending || !name.trim() || !subject.trim()}
        >
          {pending ? "Creating…" : "Create draft"}
        </button>
      </div>
    </div>
  );
}
