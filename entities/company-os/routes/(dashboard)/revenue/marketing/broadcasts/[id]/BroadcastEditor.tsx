"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BroadcastRow } from "@/entities/company-os/modules/campaigns/broadcasts";
import type { BrandOption } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import type { BrandProfile } from "@/entities/company-os/modules/campaigns/brand-profiles";
import {
  approveBroadcast,
  buildRecipients,
  cancelBroadcast,
  clearRecipients,
  sendTest,
  startSending,
  updateBroadcast,
} from "../actions";

const PERSONA_CHOICES = [
  { value: "prospect", label: "Prospects" },
  { value: "client", label: "Clients" },
];

type Note = { tone: "ok" | "err"; text: string } | null;

// ISO (stored UTC) -> the "YYYY-MM-DDTHH:mm" a datetime-local input expects, in
// the operator's local time.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BroadcastEditor({
  campaign,
  pendingCount,
  brands,
  profiles,
}: {
  campaign: BroadcastRow;
  pendingCount: number;
  brands: BrandOption[];
  profiles: BrandProfile[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<Note>(null);

  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [preheader, setPreheader] = useState(campaign.preheader ?? "");
  const [bodyMd, setBodyMd] = useState(campaign.bodyMd);
  const [replyTo, setReplyTo] = useState(campaign.replyTo ?? "");
  const [batchSize, setBatchSize] = useState(String(campaign.batchSize));
  const [personas, setPersonas] = useState<string[]>(campaign.segment.personas ?? []);
  const [brandId, setBrandId] = useState(campaign.brandId ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(campaign.scheduledAt));

  const isDraft = campaign.status === "draft";
  const activeProfile = profiles.find((p) => p.brandId === brandId) ?? null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setNote(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setNote({ tone: "ok", text: success });
        router.refresh();
      } else {
        setNote({ tone: "err", text: result.error ?? "Something went wrong." });
      }
    });
  }

  function togglePersona(value: string) {
    setPersonas((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  return (
    <>
      {note && (
        <div className={`admin-alert admin-alert--${note.tone} u-mb-4`}>
          {note.text}
        </div>
      )}

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Content</div>
        {!isDraft && (
          <div className="admin-hint u-mt-2">
            The content is frozen because this broadcast is {campaign.status}. Editing it mid-send
            would change what later recipients receive. Cancel the broadcast to edit it.
          </div>
        )}
        <div className="admin-form u-mt-3">
          <div className="admin-field">
            <label className="admin-label" htmlFor="brand">
              Brand
            </label>
            <select
              id="brand"
              className="admin-input"
              value={brandId}
              disabled={!isDraft}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">— No brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="admin-hint">Which identity this send goes out as (Edge8, AI Officer Institute).</div>
            {activeProfile && (activeProfile.voiceMd || activeProfile.primaryCta || activeProfile.positioning) && (
              <details className="admin-card u-mt-2 u-p-3">
                <summary className="u-strong u-pointer">
                  {activeProfile.brandName} voice reference
                </summary>
                <div className="u-stack u-mt-2">
                  {activeProfile.positioning && (
                    <div><span className="admin-label">Positioning</span><div>{activeProfile.positioning}</div></div>
                  )}
                  {activeProfile.voiceMd && (
                    <div><span className="admin-label">Voice</span><div className="u-prewrap">{activeProfile.voiceMd}</div></div>
                  )}
                  {activeProfile.primaryCta && (
                    <div><span className="admin-label">Primary CTA</span><div>{activeProfile.primaryCta}</div></div>
                  )}
                  <a className="admin-btn admin-btn--sm" href="/admin/revenue/marketing/brands">Edit brand profile</a>
                </div>
              </details>
            )}
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="name">
              Internal name
            </label>
            <input
              id="name"
              className="admin-input"
              value={name}
              disabled={!isDraft}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="subject">
              Subject line
            </label>
            <input
              id="subject"
              className="admin-input"
              value={subject}
              disabled={!isDraft}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="preheader">
              Preheader
            </label>
            <input
              id="preheader"
              className="admin-input"
              value={preheader}
              disabled={!isDraft}
              onChange={(e) => setPreheader(e.target.value)}
            />
            <div className="admin-hint">
              The grey line the inbox shows after the subject. Hidden inside the email itself.
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="body">
              Body
            </label>
            <textarea
              id="body"
              className="admin-textarea"
              rows={16}
              value={bodyMd}
              disabled={!isDraft}
              onChange={(e) => setBodyMd(e.target.value)}
            />
            <div className="admin-hint">
              Markdown: # headings, **bold**, *italic*, [links](https://…), and - lists. The Edge8
              wrapper, footer, and unsubscribe link are added automatically.
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="replyTo">
              Reply-to
            </label>
            <input
              id="replyTo"
              className="admin-input"
              value={replyTo}
              disabled={!isDraft}
              placeholder="dave@edge8.ai"
              onChange={(e) => setReplyTo(e.target.value)}
            />
          </div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={!isDraft || pending}
              onClick={() =>
                run(
                  () =>
                    updateBroadcast(campaign.id, {
                      name,
                      subject,
                      preheader,
                      bodyMd,
                      replyTo,
                      brandId: brandId || null,
                    }),
                  "Content saved.",
                )
              }
            >
              {pending ? "Saving…" : "Save content"}
            </button>
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => run(() => sendTest(campaign.id), "Test sent to your address.")}
            >
              Send test to me
            </button>
          </div>
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Audience</div>
        <p className="admin-page-sub u-mt-1">
          Only contacts who are marked subscribed can be reached. Job seekers, team members, and
          anyone flagged do-not-contact are excluded no matter what you pick here.
        </p>
        <p className="admin-page-sub u-mt-1">
          {campaign.brandName && campaign.brandName !== "Edge8"
            ? `This is a ${campaign.brandName} broadcast, so it reaches only ${campaign.brandName}'s brand audience.`
            : "With no brand (or the Edge8 brand) set, this reaches the full house list. Pick a guest brand to scope the send to that brand's audience only."}
        </p>
        <div className="admin-form u-mt-3">
          <div className="admin-field">
            <span className="admin-label">Personas</span>
            <div className="u-row u-gap-4 u-wrap u-mt-2">
              {PERSONA_CHOICES.map((choice) => (
                <label key={choice.value} className="u-row">
                  <input
                    type="checkbox"
                    checked={personas.includes(choice.value)}
                    disabled={!isDraft}
                    onChange={() => togglePersona(choice.value)}
                  />
                  {choice.label}
                </label>
              ))}
            </div>
            <div className="admin-hint">Leave both unticked to reach every subscribed contact.</div>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="batch">
              Batch size
            </label>
            <input
              id="batch"
              className="admin-input"
              type="number"
              min={1}
              max={1000}
              value={batchSize}
              disabled={!isDraft}
              onChange={(e) => setBatchSize(e.target.value)}
            />
            <div className="admin-hint">
              Emails per 15-minute tick. Keep this low for the first sends so bounces surface before
              the whole list has gone out.
            </div>
          </div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="admin-btn"
              disabled={!isDraft || pending}
              onClick={() =>
                run(
                  () => updateBroadcast(campaign.id, { segment: { personas }, batchSize: Number(batchSize) }),
                  "Audience settings saved.",
                )
              }
            >
              Save audience
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={!isDraft || pending}
              onClick={() =>
                startTransition(async () => {
                  setNote(null);
                  const result = await buildRecipients(campaign.id);
                  if (result.ok) {
                    setNote({ tone: "ok", text: `Added ${result.added} recipient(s).` });
                    router.refresh();
                  } else {
                    setNote({ tone: "err", text: result.error });
                  }
                })
              }
            >
              Build recipient list
            </button>
            {pendingCount > 0 && isDraft && (
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={pending}
                onClick={() => run(() => clearRecipients(campaign.id), "Recipient list cleared.")}
              >
                Clear list
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Send</div>
        <p className="admin-page-sub u-mt-1">
          {campaign.status === "draft" &&
            `${pendingCount} recipient(s) queued. Approving does not send: you start the send separately.`}
          {campaign.status === "approved" &&
            `Approved by ${campaign.approvedBy ?? "an admin"}. Nothing has been sent yet.`}
          {campaign.status === "sending" &&
            `Sending in batches of ${campaign.batchSize} every 15 minutes. ${pendingCount} left.`}
          {campaign.status === "sent" && "This broadcast has finished sending."}
          {campaign.status === "cancelled" && "This broadcast was cancelled."}
        </p>

        <div className="admin-form u-mt-3">
          <div className="admin-field">
            <label className="admin-label" htmlFor="schedule">
              Schedule
            </label>
            <input
              id="schedule"
              className="admin-input"
              type="datetime-local"
              value={scheduledAt}
              disabled={!isDraft}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <div className="admin-hint">
              {scheduledAt
                ? "Once started, the first batch waits until this time. Leave blank to send as soon as you start."
                : "No schedule: sending starts immediately when you press Start sending."}
            </div>
            {isDraft && (
              <div className="admin-form-actions u-mt-2">
                <button
                  type="button"
                  className="admin-btn"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => updateBroadcast(campaign.id, { scheduledAt: scheduledAt || null }),
                      scheduledAt ? "Schedule saved." : "Schedule cleared.",
                    )
                  }
                >
                  Save schedule
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="admin-form-actions u-mt-3">
          {campaign.status === "draft" && (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={pending || pendingCount === 0}
              onClick={() => run(() => approveBroadcast(campaign.id), "Broadcast approved.")}
            >
              Approve
            </button>
          )}
          {campaign.status === "approved" && (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={pending}
              onClick={() =>
                run(() => startSending(campaign.id), "Sending started. The first batch goes out within 15 minutes.")
              }
            >
              Start sending
            </button>
          )}
          {campaign.status !== "sent" && campaign.status !== "cancelled" && (
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              disabled={pending}
              onClick={() => run(() => cancelBroadcast(campaign.id), "Broadcast cancelled.")}
            >
              Cancel broadcast
            </button>
          )}
        </div>
      </section>
    </>
  );
}
