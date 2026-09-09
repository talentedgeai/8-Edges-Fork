"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { useActionRunner } from "@/entities/company-os/ui/useActionRunner";
import { describeState, isWriterStep, WRITER_DONE, WRITER_READY, WRITER_STEPS, type WriterState } from "@/entities/company-os/modules/campaigns/writer/steps";
import { continueWriter, retryWriterStep, startWriter, stopWriter } from "@/entities/company-os/modules/campaigns/writer/actions";
import type { MarketingCampaignRow } from "@/entities/company-os/modules/campaigns/marketing-campaigns";
import type { CalendarEntryRow } from "@/entities/company-os/modules/campaigns/marketing-calendar";

// The writer agent's corner of the campaign hub: one button to start the run,
// the steps as badges while it advances, the last change log from the blog
// asset's notes, the error when a step's check fails, and the verbs to retry,
// continue or stop. It refreshes the page while a run is in flight so the
// operator watches the steps land without reloading.

const POLL_MS = 15_000;

// The notes carry one "## Heading (stamp)" block per pass; show the last one.
export function lastNotesBlock(notes: string | null): { heading: string; lines: string[] } | null {
  if (!notes) return null;
  const blocks = notes.split(/\n(?=## )/).filter((b) => b.trim().startsWith("## "));
  const last = blocks.at(-1);
  if (!last) return null;
  const [head, ...rest] = last.trim().split("\n");
  return { heading: head.replace(/^## /, ""), lines: rest.map((l) => l.replace(/^- /, "")).filter(Boolean) };
}

export function WriterPanel({ campaign, entries }: { campaign: MarketingCampaignRow; entries: CalendarEntryRow[] }) {
  const { note, pending, run, router } = useActionRunner();
  const step = campaign.writerStep;
  const running = isWriterStep(step) && !campaign.writerError;
  const stopped = isWriterStep(step) && Boolean(campaign.writerError);
  const ready = step === WRITER_READY;
  const done = step === WRITER_DONE;
  const canStart = Boolean(campaign.brandId && campaign.idea?.trim()) && !running;
  const blog = entries.find((e) => e.channel === "blog") ?? null;
  // The blog asset already carries written content — from a completed run, a
  // stopped one, the calendar's "Draft with AI", or a manual edit. None of
  // those set writer_step, so the run pointer alone would prompt "Run the
  // writer" as if the post were empty. Key the empty-start prompt off content.
  const hasContent = Boolean(blog?.copyMd?.trim() || blog?.bodyHtml?.trim());
  const changeLog = lastNotesBlock(blog?.notes ?? null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [running, router]);

  // Where the run is on the step list. A parked run sits after validate; a
  // finished one is past every step.
  const current = isWriterStep(step) ? WRITER_STEPS.findIndex((s) => s.id === step) : ready ? 8 : done ? WRITER_STEPS.length : -1;
  const toneFor = (i: number): BadgeTone => (i < current ? "ok" : i === current ? (stopped ? "err" : "info") : "neutral");

  return (
    <section className="admin-card admin-section-card u-mb-5">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Writer agent</h2>
        <span className="admin-cell-muted u-sm">
          {step
            ? `${describeState(step as WriterState)}${campaign.writerStartedAt ? `, started ${formatDate(campaign.writerStartedAt)}` : ""}`
            : "From approved idea to a finished, formatted, SEO-complete post, by the brand's own process."}
        </span>
      </div>

      {step && (
        <p>
          {WRITER_STEPS.map((s, i) => (
            <Badge key={s.id} tone={toneFor(i)} dot={i === current && running}>
              {i + 1}. {s.label}
            </Badge>
          ))}{" "}
          <Badge tone={ready || done ? "ok" : "neutral"}>{done ? "Published" : "Ready"}</Badge>
        </p>
      )}

      {!step && !canStart && !hasContent && <p className="admin-hint">Set the brand and write the idea first; the writer needs both.</p>}
      {!step && hasContent && blog && (
        <p className="admin-alert admin-alert--ok">
          This post already has written content.{" "}
          <Link href={`/admin/revenue/marketing/campaigns/${campaign.id}/assets/${blog.id}`}>Open the post to edit or publish it.</Link>{" "}
          Running the writer again rewrites it from the draft.
        </p>
      )}
      {ready && (
        <p className="admin-alert admin-alert--ok">
          Every check passed.{" "}
          {blog && <Link href={`/admin/revenue/marketing/campaigns/${campaign.id}/assets/${blog.id}`}>Open the post and publish it.</Link>}
        </p>
      )}
      {done && blog && (
        <p className="admin-alert admin-alert--ok">
          Published and the channel posts re-derived from it.{" "}
          <Link href={`/admin/revenue/marketing/campaigns/${campaign.id}/assets/${blog.id}`}>Open the post.</Link>
        </p>
      )}
      {campaign.writerError && (
        <p className="admin-alert admin-alert--err">
          <strong>Stopped at {isWriterStep(step) ? describeState(step) : "the run"}.</strong> {campaign.writerError}
        </p>
      )}
      {changeLog && (
        <details className="admin-hint">
          <summary>Last change log: {changeLog.heading}</summary>
          <ul>
            {changeLog.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
      {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{note.text}</p>}

      <div className="admin-card-actions">
        {(!step || done) && (
          <button type="button" className={`admin-btn ${!step && hasContent ? "" : "admin-btn--primary"}`} disabled={!canStart || pending} onClick={() => run(() => startWriter(campaign.id), "Writer started; the draft is being written.")}>
            {done || hasContent ? "Run the writer again" : "Run the writer"}
          </button>
        )}
        {stopped && (
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => retryWriterStep(campaign.id), "Retrying the step.")}>
            Retry step
          </button>
        )}
        {running && (
          <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => continueWriter(campaign.id), "Handed the run on to the next step.")}>
            Continue
          </button>
        )}
        {(running || stopped || ready) && (
          <ConfirmButton
            label="Stop"
            title="Stop the writer run?"
            body="The assets keep what the steps so far wrote. Run the writer again to start from the draft."
            confirmLabel="Stop the run"
            disabled={pending}
            onConfirm={() => stopWriter(campaign.id)}
            onDone={() => router.refresh()}
          />
        )}
      </div>
    </section>
  );
}
