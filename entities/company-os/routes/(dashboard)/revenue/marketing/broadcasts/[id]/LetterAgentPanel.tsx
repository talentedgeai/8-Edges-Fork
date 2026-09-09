"use client";

import { useEffect } from "react";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { useActionRunner } from "@/entities/company-os/ui/useActionRunner";
import { describeLetterState, isLetterStep, LETTER_READY, LETTER_STEPS, type LetterState } from "@/entities/company-os/modules/campaigns/letter/steps";
import { continueLetter, retryLetterStep, startLetter, stopLetter } from "@/entities/company-os/modules/campaigns/letter/actions";

// The letter agent's corner of the broadcast page: start, the steps as badges
// while it runs, what the last step reported, the verbs. It refreshes while a
// run is in flight. Approval is not here on purpose: that is the broadcast's
// own Send section, and the agent never reaches it.

const POLL_MS = 15_000;

export type LetterAgentState = {
  step: string | null;
  error: string | null;
  startedAt: string | null;
  checklist: string[];
  testSentTo: string | null;
  gathered: number;
};

export function LetterAgentPanel({ campaignId, status, brandId, agent }: { campaignId: string; status: string; brandId: string | null; agent: LetterAgentState }) {
  const { note, pending, run, router } = useActionRunner();
  const step = agent.step;
  const running = isLetterStep(step) && !agent.error;
  const stopped = isLetterStep(step) && Boolean(agent.error);
  const ready = step === LETTER_READY;
  const canStart = Boolean(brandId) && status === "draft" && !running;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [running, router]);

  const current = isLetterStep(step) ? LETTER_STEPS.findIndex((s) => s.id === step) : ready ? LETTER_STEPS.length : -1;
  const toneFor = (i: number): BadgeTone => (i < current ? "ok" : i === current ? (stopped ? "err" : "info") : "neutral");

  return (
    <section className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Letter agent</h2>
        <span className="admin-cell-muted u-sm">
          {step
            ? `${describeLetterState(step as LetterState)}${agent.startedAt ? `, started ${formatDate(agent.startedAt)}` : ""}`
            : "Gathers the week, picks three unsent posts, writes the letter, rotates the call to action, and sends you a test. Never sends to the list."}
        </span>
      </div>

      {step && (
        <p>
          {LETTER_STEPS.map((s, i) => (
            <Badge key={s.id} tone={toneFor(i)} dot={i === current && running}>
              {i + 1}. {s.label}
            </Badge>
          ))}{" "}
          <Badge tone={ready ? "ok" : "neutral"}>Ready</Badge>
        </p>
      )}

      {!step && !brandId && <p className="admin-hint">Set the brand first; the agent reads its voice and posts from it.</p>}
      {ready && (
        <p className="admin-alert admin-alert--ok">
          The test is in {agent.testSentTo ?? "your"} inbox. Read it, then build the recipients and approve below.
        </p>
      )}
      {agent.error && (
        <p className="admin-alert admin-alert--err">
          <strong>Stopped at {isLetterStep(step) ? describeLetterState(step) : "the run"}.</strong> {agent.error}
        </p>
      )}
      {agent.checklist.length > 0 && (
        <details className="admin-hint">
          <summary>Validate checklist{agent.gathered ? ` · ${agent.gathered} data points gathered` : ""}</summary>
          <ul>
            {agent.checklist.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
      {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{note.text}</p>}

      <div className="admin-card-actions">
        {(!step || ready) && (
          <button type="button" className={`admin-btn ${ready ? "" : "admin-btn--primary"}`} disabled={!canStart || pending} onClick={() => run(() => startLetter(campaignId), "Letter agent started; gathering the week.")}>
            {ready ? "Run the agent again" : "Run the letter agent"}
          </button>
        )}
        {stopped && (
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => retryLetterStep(campaignId), "Retrying the step.")}>
            Retry step
          </button>
        )}
        {running && (
          <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => continueLetter(campaignId), "Handed the run on to the next step.")}>
            Continue
          </button>
        )}
        {(running || stopped || ready) && (
          <ConfirmButton
            label="Stop"
            title="Stop the letter agent?"
            body="The broadcast keeps what the steps so far wrote. Run the agent again to start from gather."
            confirmLabel="Stop the run"
            disabled={pending}
            onConfirm={() => stopLetter(campaignId)}
            onDone={() => router.refresh()}
          />
        )}
      </div>
    </section>
  );
}
