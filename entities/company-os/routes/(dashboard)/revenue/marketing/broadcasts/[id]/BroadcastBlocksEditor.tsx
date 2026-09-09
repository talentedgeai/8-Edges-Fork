"use client";

import { useState } from "react";
import type { BroadcastBlocks, BroadcastLayout } from "@/entities/site/client";
import { updateBroadcast } from "../actions";

const LAYOUTS: { value: BroadcastLayout; label: string }[] = [
  { value: "cards", label: "Cards: every post with its hero image" },
  { value: "list", label: "List: numbered, no images, shortest" },
  { value: "feature", label: "Feature: one lead post, the rest in brief" },
];

// The structured half of a broadcast: up to three featured posts and one call
// to action, then a test send to any address so the whole email (letter, cards,
// button, footer) can be read in a real inbox before anyone approves it.

export type PostOption = { id: string; title: string; publishDate: string | null; sent?: boolean };

// Three slots for featured posts; an empty slot is simply not sent.
const POST_SLOTS = [0, 1, 2];

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;

export function BroadcastBlocksEditor({
  campaignId,
  blocks,
  posts,
  isDraft,
  pending,
  run,
}: {
  campaignId: string;
  blocks: BroadcastBlocks;
  posts: PostOption[];
  isDraft: boolean;
  pending: boolean;
  run: Run;
}) {
  const [postIds, setPostIds] = useState<string[]>(POST_SLOTS.map((i) => blocks.posts[i] ?? ""));
  const [ctaTagline, setCtaTagline] = useState(blocks.cta?.tagline ?? "");
  const [ctaLine, setCtaLine] = useState(blocks.cta?.line ?? "");
  const [ctaLabel, setCtaLabel] = useState(blocks.cta?.label ?? "");
  const [ctaUrl, setCtaUrl] = useState(blocks.cta?.url ?? "");
  const [layout, setLayout] = useState<BroadcastLayout>(blocks.layout);

  const hasCta = Boolean(ctaTagline.trim() || ctaLabel.trim() || ctaUrl.trim());

  return (
    <section className="admin-card admin-section-card">
      <div className="admin-card-title">Featured posts and call to action</div>
      <p className="admin-page-sub u-mt-1">
        Up to three published posts, rendered as cards from the live post (title, excerpt, hero),
        then one call to action. Leave the slots empty for a plain letter.
      </p>
      <div className="admin-form u-mt-3">
        {POST_SLOTS.map((slot) => (
          <div className="admin-field" key={slot}>
            <label className="admin-label" htmlFor={`post-${slot}`}>
              Post {slot + 1}
            </label>
            <select
              id={`post-${slot}`}
              className="admin-input"
              value={postIds[slot] ?? ""}
              disabled={!isDraft}
              onChange={(e) => setPostIds((prev) => prev.map((id, i) => (i === slot ? e.target.value : id)))}
            >
              <option value="">— None —</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.publishDate ? `${p.publishDate} · ` : ""}{p.title}{p.sent ? " (already sent)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="admin-field">
          <label className="admin-label" htmlFor="layout">
            Layout
          </label>
          <select id="layout" className="admin-input" value={layout} disabled={!isDraft} onChange={(e) => setLayout(e.target.value as BroadcastLayout)}>
            {LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="ctaTagline">
            Call to action tagline
          </label>
          <input id="ctaTagline" className="admin-input" value={ctaTagline} disabled={!isDraft} onChange={(e) => setCtaTagline(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="ctaLine">
            One line under it
          </label>
          <input id="ctaLine" className="admin-input" value={ctaLine} disabled={!isDraft} onChange={(e) => setCtaLine(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="ctaLabel">
            Button label
          </label>
          <input id="ctaLabel" className="admin-input" value={ctaLabel} disabled={!isDraft} onChange={(e) => setCtaLabel(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="ctaUrl">
            Button URL
          </label>
          <input id="ctaUrl" className="admin-input" type="url" value={ctaUrl} disabled={!isDraft} placeholder="https://www.edge8.ai/contact/" onChange={(e) => setCtaUrl(e.target.value)} />
        </div>
        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={!isDraft || pending}
            onClick={() =>
              run(
                () =>
                  updateBroadcast(campaignId, {
                    blocks: {
                      posts: postIds.filter(Boolean),
                      cta: hasCta ? { tagline: ctaTagline, line: ctaLine, label: ctaLabel, url: ctaUrl } : null,
                      layout,
                    },
                  }),
                "Posts and call to action saved.",
              )
            }
          >
            {pending ? "Saving…" : "Save posts and call to action"}
          </button>
        </div>
      </div>
    </section>
  );
}
