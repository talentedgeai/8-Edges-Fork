"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import {
  CHANNELS,
  type BrandOption,
  type CalendarEntryRow,
  type PillarOption,
} from "@/entities/company-os/modules/campaigns/marketing-calendar";
import { BLOG_TYPES, IMAGE_STYLES, SOCIAL_STYLES, type BrandStylePrefs, type StyleOption } from "@/entities/company-os/modules/campaigns/style-catalogues";
import type { AssetImage } from "@/entities/company-os/modules/campaigns/marketing-images";
import { PublishEditorPanel } from "./PublishEditorPanel";
import {
  updateEntry,
  deleteEntry,
  createBroadcastFromEntry,
  repurposeEntry,
  draftWithAI,
  generateImage,
  getEntryImages,
  selectEntryImage,
  markPosted,
  publishBlogEntry,
  getEntryPerformance,
  type EntryPerformance,
} from "./actions";

type Note = { tone: "ok" | "err"; text: string } | null;

export function EntryDrawer({
  entry,
  brands,
  pillars,
  stylePrefs,
  allEntries,
  onPatched,
  onDeleted,
  onLinkedBroadcast,
  onRepurposed,
}: {
  entry: CalendarEntryRow;
  brands: BrandOption[];
  pillars: PillarOption[];
  stylePrefs: BrandStylePrefs[];
  allEntries: CalendarEntryRow[];
  onPatched: (id: string, partial: Partial<CalendarEntryRow>) => void;
  onDeleted: (id: string) => void;
  onLinkedBroadcast: (id: string, broadcastId: string) => void;
  onRepurposed: (entries: CalendarEntryRow[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<Note>(null);

  const [title, setTitle] = useState(entry.title);
  const [brandId, setBrandId] = useState(entry.brandId ?? "");
  const [channel, setChannel] = useState(entry.channel);
  const [publishDate, setPublishDate] = useState(entry.publishDate ?? "");
  const [pillarId, setPillarId] = useState(entry.pillarId ?? "");
  const [copyMd, setCopyMd] = useState(entry.copyMd ?? "");
  const [assetUrl, setAssetUrl] = useState(entry.assetUrl ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [parentId, setParentId] = useState(entry.parentId ?? "");
  const [postedUrl, setPostedUrl] = useState(entry.postedUrl ?? "");
  const [blogStyle, setBlogStyle] = useState(entry.blogStyle ?? "");
  const [socialStyle, setSocialStyle] = useState(entry.socialStyle ?? "");
  const [imageStyle, setImageStyle] = useState(entry.imageStyle ?? "");
  const [imageType, setImageType] = useState(entry.imageType ?? "");
  const [seoMd, setSeoMd] = useState(entry.seoMd ?? "");
  const [imageBriefMd, setImageBriefMd] = useState(entry.imageBriefMd ?? "");
  const [bodyHtml, setBodyHtml] = useState(entry.bodyHtml ?? "");
  // The image library (all kept versions); the selected one is the entry's image.
  const [images, setImages] = useState<AssetImage[]>([]);
  const selectedImage = images.find((i) => i.isSelected) ?? images[0] ?? null;
  const [perf, setPerf] = useState<EntryPerformance | null>(null);

  // Delivery numbers for a linked broadcast, loaded once the drawer opens.
  useEffect(() => {
    let live = true;
    setPerf(null);
    if (entry.broadcastId) {
      getEntryPerformance(entry.broadcastId).then((p) => {
        if (live) setPerf(p);
      });
    }
    return () => {
      live = false;
    };
  }, [entry.broadcastId]);

  // The entry's image versions, loaded when the drawer opens on a new entry.
  useEffect(() => {
    let live = true;
    setImages([]);
    getEntryImages(entry.id).then((imgs) => {
      if (live) setImages(imgs);
    });
    return () => {
      live = false;
    };
  }, [entry.id]);

  const parentChoices = allEntries.filter((e) => e.id !== entry.id);
  const brandPillars = brandId ? pillars.filter((p) => p.brandId === brandId) : [];

  // Style pickers show the brand's preferred styles; fall back to the full
  // catalogue when the brand has no preferences set yet.
  const prefs = stylePrefs.find((s) => s.brandId === brandId);
  const narrow = (all: StyleOption[], preferred: string[] | undefined) =>
    preferred && preferred.length > 0 ? all.filter((o) => preferred.includes(o.value)) : all;
  const blogOptions = narrow(BLOG_TYPES, prefs?.blog);
  const socialOptions = narrow(SOCIAL_STYLES, prefs?.social);
  const imageOptions = narrow(IMAGE_STYLES, prefs?.image);
  const parentEntry = entry.parentId ? allEntries.find((e) => e.id === entry.parentId) ?? null : null;
  const childCount = allEntries.filter((e) => e.parentId === entry.id).length;

  function save() {
    setNote(null);
    startTransition(async () => {
      const r = await updateEntry(entry.id, {
        title,
        brandId: brandId || null,
        channel,
        publishDate: publishDate || null,
        pillarId: pillarId || null,
        copyMd: copyMd || null,
        assetUrl: assetUrl || null,
        notes: notes || null,
        parentId: parentId || null,
        blogStyle: blogStyle || null,
        socialStyle: socialStyle || null,
        imageStyle: imageStyle || null,
        imageType: imageType || null,
        seoMd: seoMd || null,
        imageBriefMd: imageBriefMd || null,
        bodyHtml: bodyHtml || null,
      });
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      setNote({ tone: "ok", text: "Saved." });
      onPatched(entry.id, {
        title,
        brandId: brandId || null,
        brandName: brands.find((b) => b.id === brandId)?.name ?? null,
        channel,
        publishDate: publishDate || null,
        pillarId: pillarId || null,
        pillarName: pillars.find((p) => p.id === pillarId)?.name ?? null,
        copyMd: copyMd || null,
        assetUrl: assetUrl || null,
        notes: notes || null,
        parentId: parentId || null,
        blogStyle: blogStyle || null,
        socialStyle: socialStyle || null,
        imageStyle: imageStyle || null,
        imageType: imageType || null,
        seoMd: seoMd || null,
        imageBriefMd: imageBriefMd || null,
        bodyHtml: bodyHtml || null,
      });
    });
  }

  function repurpose() {
    setNote(null);
    startTransition(async () => {
      const r = await repurposeEntry(entry.id);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      onRepurposed(r.entries);
      setNote({ tone: "ok", text: "Derivatives added to the board." });
    });
  }

  function aiDraft() {
    setNote(null);
    startTransition(async () => {
      const r = await draftWithAI(entry.id);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      onRepurposed(r.entries);
      setNote({ tone: "ok", text: "AI drafted the copy in this brand's voice. Review each entry." });
    });
  }

  function genImage() {
    setNote(null);
    startTransition(async () => {
      const r = await generateImage(entry.id);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      setImages(r.images);
      onPatched(entry.id, { imageUrl: r.url });
      setNote({ tone: "ok", text: "Image generated." });
    });
  }

  function selectImage(imageId: string) {
    setNote(null);
    startTransition(async () => {
      const r = await selectEntryImage(entry.id, imageId);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      setImages(r.images);
      onPatched(entry.id, { imageUrl: r.url });
    });
  }

  // Blog: publish to the live site as a data event (validate → flip status →
  // revalidate → verify URL). No git. Social channels keep the manual post()/markPosted.
  function publishToSite() {
    setNote(null);
    startTransition(async () => {
      const r = await publishBlogEntry(entry.id);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      onPatched(entry.id, { status: "published", postedUrl: r.liveUrl });
      setNote({
        tone: "ok",
        text: r.verified ? `Published and live at ${r.liveUrl}` : (r.warning ?? "Published."),
      });
    });
  }

  function post() {
    setNote(null);
    startTransition(async () => {
      const r = await markPosted(entry.id, postedUrl);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      onPatched(entry.id, { status: "published", postedUrl: postedUrl.trim() || null });
      setNote({ tone: "ok", text: "Marked as posted." });
    });
  }

  function spawnBroadcast() {
    setNote(null);
    startTransition(async () => {
      const r = await createBroadcastFromEntry(entry.id);
      if (!r.ok) {
        setNote({ tone: "err", text: r.error });
        return;
      }
      onLinkedBroadcast(entry.id, r.broadcastId);
      router.push(`/admin/revenue/marketing/broadcasts/${r.broadcastId}`);
    });
  }

  return (
    <div className="u-stack ">
      {note && <div className={`admin-alert admin-alert--${note.tone}`}>{note.text}</div>}

      <div className="admin-card u-row u-gap-3 u-wrap u-p-3">
        <div className="u-grow u-min-0">
          <div className="admin-label">Repurposing waterfall</div>
          <div className="admin-hint u-mt-1">
            {parentEntry
              ? `Derived from "${parentEntry.title}".`
              : childCount > 0
                ? `${childCount} derivative${childCount === 1 ? "" : "s"} on the board.`
                : "Spin off dated LinkedIn, Facebook, and email versions of this asset."}
          </div>
        </div>
        <div className="u-row">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={pending || !brandId}
            title={brandId ? "Draft copy in this brand's voice" : "Set a brand first"}
            onClick={aiDraft}
          >
            {pending ? "Drafting…" : "Draft with AI"}
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={repurpose}>
            Repurpose →
          </button>
        </div>
      </div>

      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label" htmlFor="e-title">Title</label>
          <input id="e-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-brand">Brand</label>
          <select
            id="e-brand"
            className="admin-input"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              setPillarId("");
            }}
          >
            <option value="">— No brand —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-channel">Channel</label>
          <select id="e-channel" className="admin-input" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            {CHANNELS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-date">Publish date</label>
          <input id="e-date" className="admin-input" type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-pillar">Pillar</label>
          <select
            id="e-pillar"
            className="admin-input"
            value={pillarId}
            disabled={!brandId || brandPillars.length === 0}
            onChange={(e) => setPillarId(e.target.value)}
          >
            <option value="">{brandId ? "— None —" : "Pick a brand first"}</option>
            {brandPillars.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="admin-hint">Manage pillars from the Pillars card on the calendar page.</div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-parent">Repurposed from</label>
          <select id="e-parent" className="admin-input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Standalone —</option>
            {parentChoices.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          <div className="admin-hint">Link a channel post to the core asset it came from.</div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-copy">Copy</label>
          <textarea id="e-copy" className="admin-textarea" rows={8} value={copyMd} onChange={(e) => setCopyMd(e.target.value)} placeholder="Draft the post copy here…" />
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-html">HTML</label>
          <textarea
            id="e-html"
            className="admin-textarea admin-mono-sm"
            rows={8}
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            placeholder="The rendered email or content HTML. Reference images by their library URL below."
          />
          <div className="admin-hint u-mt-1">
            The email or content body. Pull in images with their library URL (copy one from a version below).
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-asset">Asset URL</label>
          <input id="e-asset" className="admin-input" value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} placeholder="Image, doc, or link" />
        </div>

        {entry.channel === "blog" && (
          <div className="admin-field">
            <label className="admin-label" htmlFor="e-blogstyle">Blog type</label>
            <select id="e-blogstyle" className="admin-input" value={blogStyle} onChange={(e) => setBlogStyle(e.target.value)}>
              <option value="">— None —</option>
              {blogOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {(entry.channel === "linkedin" || entry.channel === "facebook") && (
          <div className="admin-field">
            <label className="admin-label" htmlFor="e-socialstyle">Post style</label>
            <select id="e-socialstyle" className="admin-input" value={socialStyle} onChange={(e) => setSocialStyle(e.target.value)}>
              <option value="">— None —</option>
              {socialOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="admin-field u-row u-gap-3">
          <div className="u-grow">
            <label className="admin-label" htmlFor="e-imagestyle">Image style</label>
            <select id="e-imagestyle" className="admin-input" value={imageStyle} onChange={(e) => setImageStyle(e.target.value)}>
              <option value="">— None —</option>
              {imageOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="u-grow">
            <label className="admin-label" htmlFor="e-imagetype">Image source</label>
            <select id="e-imagetype" className="admin-input" value={imageType} onChange={(e) => setImageType(e.target.value)}>
              <option value="">— None —</option>
              <option value="real">Real photo</option>
              <option value="ai">AI-generated</option>
              <option value="mixed">Mixed</option>
              <option value="none">No image</option>
            </select>
          </div>
        </div>

        {entry.channel === "blog" && (
          <div className="admin-field">
            <label className="admin-label" htmlFor="e-seo">SEO (Patel)</label>
            <textarea id="e-seo" className="admin-textarea" rows={6} value={seoMd} onChange={(e) => setSeoMd(e.target.value)} placeholder="Title tag, meta description, slug, keywords, links…" />
          </div>
        )}

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-imgbrief">Image brief</label>
          <textarea id="e-imgbrief" className="admin-textarea" rows={4} value={imageBriefMd} onChange={(e) => setImageBriefMd(e.target.value)} placeholder="Hero concept, palette, ratios…" />
          <div className="admin-form-actions u-mt-2">
            <button type="button" className="admin-btn" disabled={pending} onClick={genImage}>
              {pending ? "Generating…" : images.length > 0 ? "Generate another" : "Generate image"}
            </button>
          </div>

          {selectedImage && (
            <a href={selectedImage.url} target="_blank" rel="noreferrer" className="u-block u-mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
              <img src={selectedImage.url} alt="Selected" className="admin-box" />
            </a>
          )}

          {images.length > 1 && (
            <div className="admin-campaign-thumbs u-pt-3">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  className={`admin-campaign-thumb${img.isSelected ? " is-selected" : ""}`}
                  disabled={pending || img.isSelected}
                  onClick={() => selectImage(img.id)}
                  title={img.isSelected ? "Selected" : `Use version ${images.length - i}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
                  <img src={img.url} alt={`Version ${images.length - i}`} />
                </button>
              ))}
            </div>
          )}

          {selectedImage && (
            <div className="admin-hint u-mt-2 u-break-all">
              Selected URL: {selectedImage.url}
            </div>
          )}
          <div className="admin-hint u-mt-2">
            Every generation is kept as a version. Uses the image brief, the chosen image style, and the brand palette. Save the brief first if you just edited it.
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="e-notes">Notes</label>
          <textarea id="e-notes" className="admin-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="admin-form-actions">
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <ConfirmButton
            label="Delete"
            title="Delete this entry?"
            body="This removes the calendar entry. Any linked broadcast is left untouched."
            confirmLabel="Delete"
            disabled={pending}
            onConfirm={() => deleteEntry(entry.id)}
            onDone={() => onDeleted(entry.id)}
          />
        </div>
      </div>

      {entry.channel === "blog" && (
        <PublishEditorPanel assetId={entry.id} onDone={() => router.refresh()} />
      )}

      {entry.channel === "blog" && (
        <div className="admin-card u-p-3">
          <div className="admin-label u-mb-2">Publish to site (manual)</div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={pending}
              onClick={publishToSite}
            >
              {entry.status === "published" ? "Re-publish" : "Publish to site"}
            </button>
            {entry.postedUrl && (
              <a className="admin-btn admin-btn--sm" href={entry.postedUrl} target="_blank" rel="noreferrer">
                View live
              </a>
            )}
          </div>
          <div className="admin-hint u-mt-2">
            Publishes straight to edge8.ai from the database: validates the post, sets it live, and
            verifies the URL. No code deploy. Needs a body, an image, and an SEO plan with a slug.
          </div>
        </div>
      )}

      {entry.channel !== "email" && entry.channel !== "blog" && (
        <div className="admin-card u-p-3">
          <div className="admin-label u-mb-2">Publish</div>
          <div className="admin-form">
            <input
              className="admin-input"
              value={postedUrl}
              onChange={(e) => setPostedUrl(e.target.value)}
              placeholder="Live post URL (optional)"
            />
            <div className="admin-form-actions u-mt-2">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={pending || entry.status === "published"}
                onClick={post}
              >
                {entry.status === "published" ? "Posted" : "Mark posted"}
              </button>
              {entry.postedUrl && (
                <a className="admin-btn admin-btn--sm" href={entry.postedUrl} target="_blank" rel="noreferrer">
                  View live
                </a>
              )}
            </div>
          </div>
          <div className="admin-hint u-mt-2">
            You post {CHANNELS.find((c) => c.id === entry.channel)?.label ?? "this"} by hand; recording it
            here moves the entry to Published and clears it from the daily reminder.
          </div>
        </div>
      )}

      {entry.channel === "email" && (
        <div className="admin-card u-p-3">
          <div className="admin-label u-mb-2">Broadcast</div>
          {entry.broadcastId ? (
            <div className="u-row u-wrap">
              {entry.broadcastStatus && (
                <Badge tone={statusTone(entry.broadcastStatus)}>{entry.broadcastStatus}</Badge>
              )}
              <Link className="admin-btn admin-btn--sm" href={`/admin/revenue/marketing/broadcasts/${entry.broadcastId}`}>
                Open broadcast
              </Link>
            </div>
          ) : (
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={spawnBroadcast}>
              Create broadcast
            </button>
          )}
          {perf && perf.sent > 0 && (
            <div className="u-row u-gap-4 u-wrap u-mt-3">
              <PerfStat label="Sent" value={perf.sent} />
              <PerfStat label="Delivered" value={perf.delivered} />
              <PerfStat label="Opened" value={perf.opened} />
              <PerfStat label="Clicked" value={perf.clicked} />
            </div>
          )}
          <div className="admin-hint u-mt-2">
            Spawns a draft broadcast in the send engine, prefilled with this entry&apos;s title, brand, and date.
          </div>
        </div>
      )}
    </div>
  );
}

function PerfStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="admin-num-lg">{value.toLocaleString()}</div>
      <div className="admin-hint">{label}</div>
    </div>
  );
}
