"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ratingBounds,
  type FieldType,
  type SurveyFieldRow,
} from "@/lib/admin/surveys";
import styles from "./survey.module.css";

// One-question-per-screen runner. Client-side validation is a courtesy; the
// API re-validates everything and resolves identity server-side.

type Phase = "intro" | "identity" | "question" | "done";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SurveyRunner({
  slug,
  name,
  introText,
  thankYouText,
  isAnonymous,
  fields,
  actorName,
  needIdentity,
  cohort,
  reviewId = null,
  subjectName = null,
  expectedLevel = null,
  initialAnswers,
}: {
  slug: string;
  name: string;
  introText: string | null;
  thankYouText: string | null;
  isAnonymous: boolean;
  fields: SurveyFieldRow[];
  actorName: string | null;
  needIdentity: boolean;
  // Event slug when the survey was reached via an event's feedback QR
  // (/surveys/x?cohort=<event-slug>) — stamped onto the response so answers
  // stay attributable per event while the survey is shared across events.
  cohort?: string | null;
  // Performance reviews (purpose 'performance_review'): the review row this
  // submission fills. Enables the localStorage draft and is sent to the API,
  // which re-authorizes the rater server-side.
  reviewId?: string | null;
  // The report's name when a manager reviews someone else (a "Reviewing X"
  // chip on the intro), null on self-assessments.
  subjectName?: string | null;
  // Where the "expected" marker sits on AI-craft rating scales (fields with
  // config.expected_marker), from the subject's career level. Null = no marker.
  expectedLevel?: number | null;
  // Editing a submitted review: the current saved answers, so the form opens
  // prefilled instead of blank. Present only in that edit path.
  initialAnswers?: Record<string, unknown>;
}) {
  const isEdit = !!initialAnswers && Object.keys(initialAnswers).length > 0;
  const [phase, setPhase] = useState<Phase>("intro");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers ?? {});
  const [respName, setRespName] = useState("");
  const [respEmail, setRespEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploads, setUploads] = useState<
    Record<string, { status: "uploading" | "done" | "error"; name?: string; error?: string }>
  >({});

  const field = fields[qIndex];

  // Reviews are long-form; losing a closed tab's answers is expensive. Draft
  // answers persist per review row in localStorage (review links are
  // auth-gated, and the draft is cleared on submit). Public surveys keep the
  // old behavior: nothing is stored.
  const draftKey = reviewId ? `e8-review-draft:${reviewId}` : null;
  useEffect(() => {
    // In edit mode the saved DB answers are the source of truth; skip restoring
    // a possibly-stale local draft over them.
    if (!draftKey || isEdit) return;
    try {
      const stored = window.localStorage.getItem(draftKey);
      if (stored) setAnswers(JSON.parse(stored));
    } catch {
      // Unreadable draft: start clean.
    }
    // Restore once per review row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || Object.keys(answers).length === 0) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
      // Storage full/blocked: the draft is a best-effort courtesy.
    }
  }, [draftKey, answers]);

  const progress = useMemo(() => {
    if (phase === "intro") return 0;
    if (phase === "identity") return 4;
    if (phase === "done") return 100;
    return Math.round((qIndex / Math.max(1, fields.length)) * 100);
  }, [phase, qIndex, fields.length]);

  function setAnswer(value: unknown) {
    setError(null);
    setAnswers((a) => ({ ...a, [field.id]: value }));
  }

  async function uploadFile(f: SurveyFieldRow, file: File) {
    const maxBytes = f.config?.max_bytes ?? 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploads((u) => ({
        ...u,
        [f.id]: { status: "error", error: `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).` },
      }));
      return;
    }
    setError(null);
    setUploads((u) => ({ ...u, [f.id]: { status: "uploading", name: file.name } }));
    try {
      // Ask the API for a signed upload URL, then PUT the file straight to
      // Supabase Storage. Posting the file through the API dies on Vercel's
      // ~4.5 MB request body cap (a 413 before our code runs), which is well
      // under the 10 MB this form promises.
      const res = await fetch(`/api/surveys/${slug}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_id: f.id, file_type: file.type, file_size: file.size }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url || !body.path) {
        setUploads((u) => ({ ...u, [f.id]: { status: "error", error: body.error ?? "Upload failed." } }));
        return;
      }
      const put = await fetch(body.url as string, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!put.ok) {
        setUploads((u) => ({ ...u, [f.id]: { status: "error", error: "Upload failed. Try again." } }));
        return;
      }
      setAnswers((a) => ({ ...a, [f.id]: body.path as string }));
      setUploads((u) => ({ ...u, [f.id]: { status: "done", name: file.name } }));
    } catch {
      setUploads((u) => ({ ...u, [f.id]: { status: "error", error: "Upload failed. Try again." } }));
    }
  }

  function validateCurrent(): string | null {
    const raw = answers[field.id];
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === "string" && raw.trim() === "") ||
      (Array.isArray(raw) && raw.length === 0);
    if (field.required && empty) return "This question is required.";
    return null;
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: "", // honeypot
          name: respName,
          email: respEmail,
          answers,
          cohort: cohort ?? undefined,
          review: reviewId ?? undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (draftKey) {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          // Leaving a stale draft behind is harmless; submission wins.
        }
      }
      setPhase("done");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function start() {
    setError(null);
    if (fields.length === 0) return;
    setPhase(needIdentity ? "identity" : "question");
  }

  function nextFromIdentity() {
    if (!respName.trim()) return setError("Please enter your name.");
    if (!EMAIL_RE.test(respEmail.trim())) return setError("Please enter a valid email.");
    setError(null);
    setPhase("question");
  }

  function next() {
    const err = validateCurrent();
    if (err) return setError(err);
    setError(null);
    if (qIndex + 1 < fields.length) setQIndex(qIndex + 1);
    else void submit();
  }

  function back() {
    setError(null);
    if (qIndex > 0) setQIndex(qIndex - 1);
    else setPhase(needIdentity ? "identity" : "intro");
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const isTextarea = (e.target as HTMLElement).tagName === "TEXTAREA";
    if (isTextarea && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    if (phase === "identity") nextFromIdentity();
    else if (phase === "question") next();
  }

  function renderInput() {
    const type = field.type as FieldType;
    const raw = answers[field.id];

    if (type === "short_text") {
      return (
        <input
          className={styles.input}
          value={typeof raw === "string" ? raw : ""}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Type your answer…"
          autoFocus
        />
      );
    }
    if (type === "long_text") {
      return (
        <>
          <textarea
            className={styles.textarea}
            rows={4}
            value={typeof raw === "string" ? raw : ""}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={onEnter}
            placeholder="Type your answer…"
            autoFocus
          />
          <div className={styles.hint}>Cmd/Ctrl + Enter to continue</div>
        </>
      );
    }
    if (type === "single_choice" || type === "multi_choice") {
      const choices = field.config?.choices ?? [];
      const picked = new Set(
        type === "multi_choice"
          ? Array.isArray(raw)
            ? (raw as string[])
            : []
          : typeof raw === "string"
            ? [raw]
            : [],
      );
      return (
        <div className={styles.choices}>
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.choice}${picked.has(c) ? ` ${styles.choiceActive}` : ""}`}
              onClick={() => {
                if (type === "single_choice") setAnswer(c);
                else {
                  const nextSet = new Set(picked);
                  if (nextSet.has(c)) nextSet.delete(c);
                  else nextSet.add(c);
                  setAnswer([...nextSet]);
                }
              }}
            >
              {c}
            </button>
          ))}
          {type === "multi_choice" && <div className={styles.hint}>Pick all that apply</div>}
        </div>
      );
    }
    if (type === "rating") {
      const { min, max } = ratingBounds(field.config);
      const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const levels = field.config?.levels;
      const marker = field.config?.expected_marker && expectedLevel ? expectedLevel : null;
      return (
        <div>
          <div className={styles.scale}>
            {nums.map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.scaleBtn}${raw === n ? ` ${styles.scaleActive}` : ""}`}
                onClick={() => setAnswer(n)}
                aria-label={levels?.[String(n)] ? `${n}: ${levels[String(n)]}` : String(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {marker !== null && (
            <div className={styles.scaleTicks} aria-hidden>
              {nums.map((n) => (
                <span key={n} className={styles.scaleTick}>
                  {n === marker ? <b>expected</b> : " "}
                </span>
              ))}
            </div>
          )}
          {levels ? (
            // Anchored scale: show the selected value's anchor so the number
            // means the same thing to every rater.
            <div className={styles.hint}>
              {typeof raw === "number" && levels[String(raw)] ? (
                <>
                  <strong>{raw}</strong> · {levels[String(raw)]}
                </>
              ) : (
                "Select a level to see what it means"
              )}
            </div>
          ) : (
            (field.config?.min_label || field.config?.max_label) && (
              <div className={styles.scaleLabels}>
                <span>{field.config?.min_label ?? ""}</span>
                <span>{field.config?.max_label ?? ""}</span>
              </div>
            )
          )}
        </div>
      );
    }
    if (type === "date") {
      return (
        <input
          className={styles.input}
          type="date"
          value={typeof raw === "string" ? raw : ""}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={onEnter}
          autoFocus
        />
      );
    }
    if (type === "file") {
      const up = uploads[field.id];
      const accept = (field.config?.accept ?? []).join(",");
      return (
        <div>
          <input
            className={styles.input}
            type="file"
            accept={accept || undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(field, file);
            }}
          />
          {up?.status === "uploading" && <div className={styles.hint}>Uploading…</div>}
          {up?.status === "done" && <div className={styles.hint}>✓ {up.name}</div>}
          {up?.status === "error" && <div className={styles.error}>{up.error}</div>}
        </div>
      );
    }
    // yes_no
    return (
      <div className={styles.choices}>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            className={`${styles.choice}${raw === v ? ` ${styles.choiceActive}` : ""}`}
            onClick={() => setAnswer(v)}
          >
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={styles.progressTrack} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} /* layout-ok: data-driven progress width */ />
      </div>

      <div className={styles.card}>
        {phase === "intro" && (
          <>
            <div className={`${styles.eyebrow} site-brand-label`}>Edge8 survey</div>
            <h1 className={styles.title}>{name}</h1>
            {introText && <p className={styles.sub}>{introText}</p>}
            {isAnonymous ? (
              <div className={styles.chip}>Anonymous — your answers are not linked to you</div>
            ) : subjectName ? (
              <div className={styles.chip}>Reviewing {subjectName}</div>
            ) : actorName ? (
              <div className={styles.chip}>Responding as {actorName}</div>
            ) : null}
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={start} disabled={fields.length === 0}>
                Start
              </button>
              <span className={styles.hint}>
                {fields.length} question{fields.length === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}

        {phase === "identity" && (
          <>
            <h1 className={styles.label}>First, who are you?</h1>
            <p className={styles.help}>So we know who this response belongs to.</p>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="sr-name">Name</label>
              <input
                id="sr-name"
                className={styles.input}
                value={respName}
                onChange={(e) => setRespName(e.target.value)}
                onKeyDown={onEnter}
                autoFocus
              />
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="sr-email">Email</label>
              <input
                id="sr-email"
                className={styles.input}
                type="email"
                value={respEmail}
                onChange={(e) => setRespEmail(e.target.value)}
                onKeyDown={onEnter}
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.actions}>
              <button className={styles.btnGhost} onClick={() => setPhase("intro")}>
                Back
              </button>
              <button className={styles.btnPrimary} onClick={nextFromIdentity}>
                Continue
              </button>
            </div>
          </>
        )}

        {phase === "question" && field && (
          <>
            <div className={styles.count}>
              {qIndex + 1} / {fields.length}
            </div>
            <h1 className={styles.label}>
              {field.label}
              {field.required && " *"}
            </h1>
            {field.help_text && <p className={styles.help}>{field.help_text}</p>}
            {renderInput()}
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.actions}>
              <button className={styles.btnGhost} onClick={back} disabled={submitting}>
                Back
              </button>
              <button className={styles.btnPrimary} onClick={next} disabled={submitting}>
                {submitting ? "Sending…" : qIndex + 1 === fields.length ? "Submit" : "Next"}
              </button>
              {!field.required && <span className={styles.hint}>Optional</span>}
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <div className={styles.eyebrow}>All done</div>
            <h1 className={styles.title}>Thank you.</h1>
            <p className={styles.sub}>{thankYouText || "Your response has been recorded."}</p>
          </>
        )}
      </div>
    </>
  );
}
