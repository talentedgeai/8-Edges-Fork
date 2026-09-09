"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useActionRunner } from "@/entities/company-os/ui/useActionRunner";
import Link from "next/link";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { formatDate } from "@/kernel/ui/format";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import {
  CHANNELS,
  CHANNEL_LABEL,
  STATUS_LABEL,
  type BrandOption,
  type CalendarChannel,
  type CalendarEntryRow,
  type CalendarStatus,
  type PillarOption,
} from "@/entities/company-os/modules/campaigns/marketing-calendar";
import {
  CAMPAIGN_STATUSES,
  type CampaignReport,
  type MarketingCampaignRow,
} from "@/entities/company-os/modules/campaigns/marketing-campaigns";
import { CalendarBoard } from "../../calendar/CalendarBoard";
import { draftCampaignAssets, moveEntry } from "../../calendar/actions";
import { addAssetToCampaign, generateSeoGeoPlan, updateCampaign } from "../actions";
// The three panels below are self-contained; they live in siblings so this file
// stays the tab shell and the header form.
import { AssetsByChannel } from "./AssetsByChannel";
import { AssetsList } from "./AssetsList";
import { ReportPanel } from "./ReportPanel";

type Tab = "idea" | "assets" | "workboard" | "report" | "seo";

// The empty-state structure for the SEO/GEO plan, so the three sections are
// visible before anything is written. "Generate with AI" fills them in.
const SEO_SCAFFOLD = `## Search (SEO)
- Primary keyword:
- Secondary keywords:
- Title tag (<=60 chars):
- Meta description (<=155 chars):
- URL slug:
- Internal link targets:

## FAQ
1. Q:
   A:
2. Q:
   A:

## GEO (generative engines)
- Named entities:
- Citable stats (with source):
- One-sentence definition to quote:
- Questions people ask an AI assistant:`;

export function CampaignHub({
  campaign,
  entries: initialEntries,
  report,
  brands,
  pillars,
}: {
  campaign: MarketingCampaignRow;
  entries: CalendarEntryRow[];
  report: CampaignReport;
  brands: BrandOption[];
  pillars: PillarOption[];
}) {
  const searchParams = useSearchParams();
  // The note, the transition and the "run an action, then say what happened"
  // closure are the shared ones — see entities/company-os/ui/useActionRunner.ts.
  const { note, setNote, pending, startTransition, run, router } = useActionRunner();
  const [drafting, setDrafting] = useState(false);
  const [tab, setTab] = useState<Tab>("idea");
  const [editing, setEditing] = useState(false);
  const [ideaEditing, setIdeaEditing] = useState(false);

  const [name, setName] = useState(campaign.name);
  const [idea, setIdea] = useState(campaign.idea ?? "");
  const [objective, setObjective] = useState(campaign.objective ?? "");
  const [brandId, setBrandId] = useState(campaign.brandId ?? "");
  const [pillarId, setPillarId] = useState(campaign.pillarId ?? "");
  const [startsOn, setStartsOn] = useState(campaign.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(campaign.endsOn ?? "");
  const [status, setStatus] = useState(campaign.status);
  const [seoGeoMd, setSeoGeoMd] = useState(campaign.seoGeoMd ?? "");

  // Follows the server's entries across router.refresh() so a move's server-side
  // effects, and other editors' changes, show without a hard reload.
  const [entries, setEntries, { begin, end }] = useServerSyncedState(initialEntries);

  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newChannel, setNewChannel] = useState<CalendarChannel>("blog");
  const [newDate, setNewDate] = useState("");

  const brandPillars = brandId ? pillars.filter((p) => p.brandId === brandId) : [];
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const brandName = brand?.name ?? null;
  const pillarName = pillars.find((p) => p.id === pillarId)?.name ?? null;

  function saveHeader() {
    run(
      () =>
        updateCampaign(campaign.id, {
          name,
          objective: objective || null,
          brandId: brandId || null,
          pillarId: pillarId || null,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          status,
        }),
      "Campaign saved.",
      () => setEditing(false),
    );
  }

  function saveIdea() {
    run(() => updateCampaign(campaign.id, { idea }), "Idea saved.", () => setIdeaEditing(false));
  }

  function saveSeo() {
    run(() => updateCampaign(campaign.id, { seoGeoMd: seoGeoMd || null }), "SEO / GEO plan saved.");
  }

  function generatePlan() {
    setNote(null);
    startTransition(async () => {
      const r = await generateSeoGeoPlan(campaign.id);
      if (r.ok) {
        setSeoGeoMd(r.seoGeoMd);
        setNote({ tone: "ok", text: "Plan drafted. Review and edit, then Save." });
      } else {
        setNote({ tone: "err", text: r.error });
      }
    });
  }

  // The campaign's starting point: read the brand profile and draft one asset
  // per active channel. Long-running (it writes real copy), so it has its own
  // busy flag rather than sharing the transition used by the quick saves.
  function draftAll() {
    if (drafting) return;
    setNote(null);
    setDrafting(true);
    draftCampaignAssets(campaign.id)
      .then((r) => {
        if (r.ok) {
          setTab("assets");
          setNote({
            tone: "ok",
            text: `Drafted ${r.channels.length} asset${r.channels.length === 1 ? "" : "s"}. Open each one to review and refine.`,
          });
          router.refresh();
        } else {
          setNote({ tone: "err", text: r.error });
        }
      })
      .finally(() => setDrafting(false));
  }

  // Auto-draft once when the create form hands off with ?draft=1, then strip the
  // flag so a refresh does not fire it again.
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current) return;
    if (searchParams.get("draft") !== "1") return;
    autoFired.current = true;
    router.replace(`/admin/revenue/marketing/campaigns/${campaign.id}`, { scroll: false });
    if (campaign.brandId && (campaign.idea ?? "").trim()) draftAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design: it reads the hand-off flag once, and the ref guards any re-run
  }, []);

  function openAsset(id: string) {
    router.push(`/admin/revenue/marketing/campaigns/${campaign.id}/assets/${id}`);
  }

  // Optimistic status move for the workboard. Either way the outcome, refresh:
  // on success so the server's view of the entry replaces the guess, on failure
  // so the hook rolls back to server truth instead of a captured snapshot.
  function move(id: string, next: string) {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, status: next as CalendarEntryRow["status"] } : e)));
    setNote(null);
    begin();
    moveEntry(id, next).then((r) => {
      if (!r.ok) setNote({ tone: "err", text: `Couldn't move: ${r.error}` });
      end();
      router.refresh();
    });
  }

  function addAsset() {
    const title = newTitle.trim();
    if (!title) {
      setNote({ tone: "err", text: "Give the asset a title." });
      return;
    }
    setNote(null);
    startTransition(async () => {
      const result = await addAssetToCampaign(campaign.id, {
        title,
        channel: newChannel,
        publishDate: newDate || null,
      });
      if (result.ok) {
        setEntries((prev) => [
          ...prev,
          {
            id: result.id,
            title,
            brandId: campaign.brandId,
            brandName: campaign.brandName,
            pillarId: campaign.pillarId,
            pillarName: campaign.pillarName,
            channel: newChannel,
            status: "idea",
            publishDate: newDate || null,
            parentId: null,
            broadcastId: null,
            broadcastStatus: null,
            campaignId: campaign.id,
            campaignName: campaign.name,
            copyMd: null,
            assetUrl: null,
            postedUrl: null,
            notes: null,
            blogStyle: null,
            socialStyle: null,
            imageStyle: null,
            imageType: null,
            seoMd: null,
            imageBriefMd: null,
            imageUrl: null,
            bodyHtml: null,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
          },
        ]);
        setNewTitle("");
        setNewDate("");
        setAddOpen(false);
        setNote({ tone: "ok", text: "Asset added." });
        router.refresh();
      } else {
        setNote({ tone: "err", text: result.error });
      }
    });
  }

  const windowLabel =
    startsOn || endsOn ? `${formatDate(startsOn || null)} – ${formatDate(endsOn || null)}` : "—";

  return (
    <div className="u-stack ">
      {note && <div className={`admin-alert admin-alert--${note.tone}`}>{note.text}</div>}

      {/* Header: goal/dates/pillar/brand. The idea has its own tab. */}
      <section className="admin-card admin-section-card">
        <div className="u-row-top u-wrap u-between">
          <div className="u-row u-wrap">
            <span className="admin-chip admin-chip--accent">Campaign</span>
            <Badge tone={status === "done" ? "ok" : status === "active" ? "warn" : "info"}>
              {CAMPAIGN_STATUSES.find((s) => s.id === status)?.label ?? status}
            </Badge>
          </div>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
            {editing ? "Close" : "Edit"}
          </button>
        </div>

        {!editing ? (
          <div className="admin-summary-pills u-mt-4">
            <span className="admin-pill admin-pill--text u-flex-320">
              <span className="admin-pill-label">Goal</span>
              <span className="admin-pill-val">{objective || "—"}</span>
            </span>
            <span className="admin-pill">
              <span className="admin-pill-label">Window</span>
              <span className="admin-pill-val">{windowLabel}</span>
            </span>
            <span className="admin-pill">
              <span className="admin-pill-label">Pillar</span>
              <span className="admin-pill-val">{pillarName || "—"}</span>
            </span>
            <span className="admin-pill">
              <span className="admin-pill-label">Brand</span>
              <span className="admin-pill-val">{brandName || "—"}</span>
            </span>
          </div>
        ) : (
          <div className="admin-form u-mt-4">
            <div className="admin-field">
              <label className="admin-label" htmlFor="h-name">Name</label>
              <input id="h-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="admin-hint">Used in lists, breadcrumbs, and this header. Edit the idea itself in the Idea tab.</div>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="h-goal">Goal</label>
              <input id="h-goal" className="admin-input" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Lead-gen: 25 demos booked" />
            </div>
            <div className="admin-field u-row u-gap-3">
              <div className="u-grow">
                <label className="admin-label" htmlFor="h-brand">Brand</label>
                <select
                  id="h-brand"
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
              <div className="u-grow">
                <label className="admin-label" htmlFor="h-pillar">Pillar</label>
                <select
                  id="h-pillar"
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
              </div>
            </div>
            <div className="admin-field u-row u-gap-3">
              <div className="u-grow">
                <label className="admin-label" htmlFor="h-start">Starts</label>
                <input id="h-start" className="admin-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
              <div className="u-grow">
                <label className="admin-label" htmlFor="h-end">Ends</label>
                <input id="h-end" className="admin-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
              <div className="u-grow">
                <label className="admin-label" htmlFor="h-status">Status</label>
                <select id="h-status" className="admin-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={saveHeader} disabled={pending || !name.trim()}>
                {pending ? "Saving…" : "Save campaign"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Starting point: draft every asset from the brand's profile. */}
      <section className="admin-card admin-section-card">
        <div className="admin-campaign-section-head">
          <div>
            <div className="admin-card-title">Draft the assets</div>
            <p className="admin-page-sub u-mt-1 u-max-form">
              {brand ? (
                <>
                  Reads the idea and{" "}
                  <Link href={`/admin/revenue/marketing/brands/${brand.slug}`}>{brand.name}&apos;s brand profile</Link>{" "}
                  (its voice, active channels, and styles), then drafts one asset per channel below.
                  Nothing is sent; every piece lands as a draft to review.
                </>
              ) : (
                <>Set a brand on this campaign (Edit above) so the writer knows the voice and which channels to produce.</>
              )}
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={draftAll}
            disabled={drafting || pending || !brandId || !(idea ?? "").trim()}
          >
            {drafting ? "Drafting all assets…" : entries.length > 0 ? "Re-draft all assets" : "Draft all assets with AI"}
          </button>
        </div>
      </section>

      {/* Tabs */}
      <div>
        <nav className="admin-tabs">
          <button type="button" className={`admin-tab${tab === "idea" ? " is-active" : ""}`} onClick={() => setTab("idea")}>
            Idea
          </button>
          <button type="button" className={`admin-tab${tab === "assets" ? " is-active" : ""}`} onClick={() => setTab("assets")}>
            Assets by channel
          </button>
          <button type="button" className={`admin-tab${tab === "workboard" ? " is-active" : ""}`} onClick={() => setTab("workboard")}>
            Workboard
          </button>
          <button type="button" className={`admin-tab${tab === "report" ? " is-active" : ""}`} onClick={() => setTab("report")}>
            Report
          </button>
          <button type="button" className={`admin-tab${tab === "seo" ? " is-active" : ""}`} onClick={() => setTab("seo")}>
            SEO / GEO plan
          </button>
        </nav>

        {tab === "idea" && (
          <section className="admin-card admin-section-card">
            <div className="u-row u-wrap u-between">
              <div className="admin-card-title">The idea</div>
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                onClick={() => setIdeaEditing((v) => !v)}
                disabled={pending}
              >
                {ideaEditing ? "Cancel" : "Edit"}
              </button>
            </div>
            <p className="admin-page-sub u-mt-1">
              The founder&apos;s pitch, in full. This is the heart of the campaign; the writer and every
              asset take their cue from it.
            </p>
            {ideaEditing ? (
              <div className="admin-form u-mt-3">
                <textarea
                  className="admin-textarea"
                  rows={12}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Founders keep asking whether AI replaces their team. It doesn't, it makes a centaur. Let's own that answer across every channel for a month."
                />
                <div className="admin-form-actions">
                  <button type="button" className="admin-btn admin-btn--primary" onClick={saveIdea} disabled={pending || !idea.trim()}>
                    {pending ? "Saving…" : "Save idea"}
                  </button>
                </div>
              </div>
            ) : idea.trim() ? (
              <p className="admin-campaign-campaign-idea u-mt-3">{idea}</p>
            ) : (
              <div className="admin-empty u-mt-3">
                No idea written yet. Click Edit to pitch it.
              </div>
            )}
          </section>
        )}

        {tab === "assets" && (
          <AssetsByChannel
            campaignId={campaign.id}
            entries={entries}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newChannel={newChannel}
            setNewChannel={setNewChannel}
            newDate={newDate}
            setNewDate={setNewDate}
            addAsset={addAsset}
            pending={pending}
          />
        )}

        {tab === "workboard" && (
          <div className="admin-card admin-section-card">
            <div className="admin-card-title">Workboard</div>
            <p className="admin-page-sub u-mt-1 u-mb-3">
              Where each asset sits in production. Drag a card to move its stage, or open one to edit
              its copy and images.
            </p>
            {entries.length === 0 ? (
              <div className="admin-empty">No assets yet.</div>
            ) : (
              <CalendarBoard entries={entries} onMove={move} onCardClick={openAsset} />
            )}
          </div>
        )}

        {tab === "report" && <ReportPanel report={report} />}

        {tab === "seo" && (
          <section className="admin-card admin-section-card">
            <div className="admin-campaign-section-head">
              <div>
                <div className="admin-card-title">SEO / GEO plan</div>
                <p className="admin-page-sub u-mt-1 u-max-form">
                  Three parts, one plan the writer reads when drafting. <strong>Search</strong> is the
                  classic package (keywords, title tag, meta, slug, internal links). <strong>FAQ</strong> is
                  the real questions people type: these win featured snippets and People Also Ask, and
                  ship as FAQ structured data on the blog post. <strong>GEO</strong> is what gets you cited
                  by ChatGPT and Perplexity: named entities, quotable stats with sources, a one-line
                  definition, and the question phrasings people ask an assistant.
                </p>
              </div>
              <button type="button" className="admin-btn admin-btn--sm" onClick={generatePlan} disabled={pending}>
                {pending ? "Generating…" : seoGeoMd.trim() ? "Regenerate with AI" : "Generate with AI"}
              </button>
            </div>
            <div className="admin-form u-mt-4">
              <textarea
                className="admin-textarea"
                rows={20}
                value={seoGeoMd}
                onChange={(e) => setSeoGeoMd(e.target.value)}
                placeholder={SEO_SCAFFOLD}
              />
              <div className="admin-form-actions">
                <button type="button" className="admin-btn admin-btn--primary" onClick={saveSeo} disabled={pending}>
                  {pending ? "Saving…" : "Save plan"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
