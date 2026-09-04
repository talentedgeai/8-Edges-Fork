"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBlankSurvey } from "./actions";

// Create-on-click: make a blank draft and go straight to the builder, so there
// is no separate metadata step before you can add questions.
export function NewSurveyButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn--primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await createBlankSurvey();
            if (res.ok) router.push(`/admin/operations/surveys/${res.id}`);
            else setError(res.error);
          })
        }
      >
        {pending ? "Creating…" : "New survey"}
      </button>
      {error && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {error}
        </div>
      )}
    </>
  );
}
