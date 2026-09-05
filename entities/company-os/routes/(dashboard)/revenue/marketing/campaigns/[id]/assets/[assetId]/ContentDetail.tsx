"use client";

import { useState, useTransition } from "react";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { STATUS_LABEL, type CalendarEntryRow } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import type { AssetImage } from "@/entities/company-os/modules/campaigns/marketing-images";
import { BLOG_TYPES } from "@/entities/company-os/modules/campaigns/style-catalogues";
import {
  getCopyPrompt,
  getImagePrompt,
  regenerateAssetCopy,
  regenerateAssetImage,
  saveAssetBlogStyle,
  saveAssetCopy,
  selectAssetImage,
} from "./actions";
import { BlogPreview } from "./BlogPreview";
import { RegenerateModal } from "./RegenerateModal";

type Note = { tone: "ok" | "err"; text: string } | null;

export function ContentDetail({
  campaignId,
  entry,
  initialHtml,
  initialImages,
}: {
  campaignId: string;
  entry: CalendarEntryRow;
  initialHtml: string;
  initialImages: AssetImage[];
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<Note>(null);

  const [editing, setEditing] = useState(false);
  const [copyMd, setCopyMd] = useState(entry.copyMd ?? "");
  const [html, setHtml] = useState(initialHtml);

  const [images, setImages] = useState<AssetImage[]>(initialImages);
  const selected = images.find((i) => i.isSelected) ?? images[0] ?? null;

  const [modal, setModal] = useState<"image" | "text" | null>(null);

  const isBlog = entry.channel === "blog";
  const [blogStyle, setBlogStyle] = useState(entry.blogStyle ?? "");

  function pickBlogStyle(style: string) {
    const previous = blogStyle;
    setBlogStyle(style); // optimistic: the preview restyles immediately
    setNote(null);
    startTransition(async () => {
      const r = await saveAssetBlogStyle(campaignId, entry.id, style);
      if (!r.ok) {
        setBlogStyle(previous);
        setNote({ tone: "err", text: r.error });
      }
    });
  }

  function saveCopy() {
    setNote(null);
    startTransition(async () => {
      const r = await saveAssetCopy(campaignId, entry.id, copyMd);
      if (r.ok) {
        setHtml(r.html);
        setEditing(false);
        setNote({ tone: "ok", text: "Copy saved." });
      } else {
        setNote({ tone: "err", text: r.error });
      }
    });
  }

  function pickImage(imageId: string) {
    setNote(null);
    startTransition(async () => {
      const r = await selectAssetImage(campaignId, entry.id, imageId);
      if (r.ok) {
        setImages(r.images);
      } else {
        setNote({ tone: "err", text: r.error });
      }
    });
  }

  return (
    <div className="u-stack u-gap-4">
      {note && <div className={`admin-alert admin-alert--${note.tone}`}>{note.text}</div>}

      <div className="u-row u-wrap">
        <span className="admin-chip">{entry.channel}</span>
        <Badge tone={statusTone(entry.status)}>{STATUS_LABEL[entry.status]}</Badge>
        {entry.pillarName && <span className="admin-chip">Pillar: {entry.pillarName}</span>}
        {entry.channel === "email" && entry.broadcastId && (
          <span className="admin-chip admin-chip--accent">Broadcast</span>
        )}
      </div>

      <div className="admin-campaign-detail-grid">
        {/* Formatted text */}
        <section className="admin-card admin-campaign-panel">
          <div className="admin-campaign-panel-head">
            <span className="admin-campaign-panel-title">{isBlog ? "Blog preview" : "Formatted text"}</span>
            <div className="u-row u-wrap">
              {isBlog && (
                <select
                  className="admin-select admin-campaign-style-select"
                  value={blogStyle}
                  onChange={(e) => pickBlogStyle(e.target.value)}
                  disabled={pending}
                  aria-label="Blog style"
                >
                  <option value="">Style: none</option>
                  {BLOG_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                onClick={() => setEditing((v) => !v)}
                disabled={pending}
              >
                {editing ? "Preview" : "Edit markdown"}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--primary"
                onClick={() => setModal("text")}
                disabled={pending}
              >
                Regenerate text
              </button>
            </div>
          </div>
          {editing ? (
            <div className="admin-form u-p-4">
              <textarea
                className="admin-textarea"
                rows={20}
                value={copyMd}
                onChange={(e) => setCopyMd(e.target.value)}
                placeholder="Draft the post copy in markdown…"
              />
              <div className="admin-form-actions">
                <button type="button" className="admin-btn admin-btn--primary" onClick={saveCopy} disabled={pending}>
                  {pending ? "Saving…" : "Save copy"}
                </button>
              </div>
            </div>
          ) : html.trim() ? (
            isBlog ? (
              <BlogPreview
                title={entry.title}
                html={html}
                blogStyle={blogStyle || null}
                categoryLabel={entry.pillarName ?? entry.campaignName}
                publishDate={entry.publishDate}
                copyMd={copyMd}
                coverUrl={selected?.url ?? null}
              />
            ) : (
              <div className="admin-idea-plan u-p-4" dangerouslySetInnerHTML={{ __html: html }} />
            )
          ) : (
            <div className="admin-empty u-m-4">
              No copy yet. Edit markdown to write it, or draft it from the calendar.
            </div>
          )}
        </section>

        {/* Images */}
        <section className="admin-card admin-campaign-panel">
          <div className="admin-campaign-panel-head">
            <span className="admin-campaign-panel-title">
              Images{images.length > 0 ? ` · ${images.length}` : ""}
            </span>
            <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => setModal("image")} disabled={pending}>
              {images.length > 0 ? "Regenerate image" : "Generate image"}
            </button>
          </div>

          {selected ? (
            <>
              {/* For a blog, the cover in the preview already shows the selected
                  image full size, so don't duplicate it here; just show the
                  version tray. Other channels have no preview cover, so show it. */}
              {!isBlog && (
                <a href={selected.url} target="_blank" rel="noreferrer" className="admin-campaign-imgbox">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
                  <img src={selected.url} alt={entry.title} />
                </a>
              )}
              {(isBlog ? images.length >= 1 : images.length > 1) && (
                <div className="admin-campaign-thumbs" style={isBlog ? { paddingTop: 14 } : undefined}>
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      className={`admin-campaign-thumb${img.isSelected ? " is-selected" : ""}`}
                      onClick={() => pickImage(img.id)}
                      disabled={pending || img.isSelected}
                      title={img.isSelected ? "Selected" : "Use this version"}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
                      <img src={img.url} alt={`Version ${images.length - i}`} />
                    </button>
                  ))}
                </div>
              )}
              <div className="admin-hint u-p-4 u-pt-0">
                {isBlog
                  ? "The cover in the preview shows the selected image. Every generation is kept; click a version to switch, or regenerate to add one."
                  : "Every generation is kept. The highlighted version is the one that publishes; click an older one to switch back."}
              </div>
            </>
          ) : (
            <div className="admin-empty u-m-4">
              No image yet. Generate one from the entry&apos;s image brief and the brand palette.
            </div>
          )}
        </section>
      </div>

      {modal === "image" && (
        <RegenerateModal
          title="Regenerate image"
          footnote="Result is added as a new version. Nothing is overwritten."
          builtFrom="Title, chosen image style, the brand's image guidance, and the image brief. Edit the prompt directly, or change those on the entry first."
          loadPrompt={() => getImagePrompt(entry.id)}
          onSubmit={async (prompt) => {
            const r = await regenerateAssetImage(campaignId, entry.id, prompt);
            if (r.ok) {
              setImages(r.images);
              setNote({ tone: "ok", text: "New image version added." });
              return { ok: true };
            }
            return { ok: false, error: r.error };
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "text" && (
        <RegenerateModal
          title="Regenerate text"
          footnote="This regenerates and saves the copy immediately, replacing the current text. Text has no version history (only images keep versions)."
          builtFrom="The brand voice profile (fixed), plus this asset's title, current draft, chosen style, and notes. Edit the instruction directly, or change those on the entry first."
          loadPrompt={() => getCopyPrompt(entry.id)}
          onSubmit={async (prompt) => {
            const r = await regenerateAssetCopy(campaignId, entry.id, prompt);
            if (r.ok) {
              setHtml(r.html);
              setCopyMd(r.bodyMd);
              setEditing(false);
              setNote({ tone: "ok", text: "Copy regenerated." });
              return { ok: true };
            }
            return { ok: false, error: r.error };
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
