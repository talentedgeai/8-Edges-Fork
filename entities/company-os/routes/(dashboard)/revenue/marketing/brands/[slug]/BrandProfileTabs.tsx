"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BrandProfile } from "@/entities/company-os/modules/campaigns/brand-profiles";
import { BLOG_TYPES, IMAGE_STYLES, SOCIAL_STYLES, type StyleOption } from "@/entities/company-os/modules/campaigns/style-catalogues";
import { saveBrandProfile } from "../actions";

type FieldKey =
  | "positioning" | "audience" | "offer" | "primaryCta" | "authorMd"
  | "voiceMd" | "rulesMd"
  | "channelsMd"
  | "processMd" | "blogStylesMd" | "editingLensMd" | "seoLensMd" | "imageStyleMd";

const TABS: { key: string; label: string; fields: FieldKey[] }[] = [
  { key: "basics", label: "Brand Basics", fields: ["positioning", "audience", "offer", "primaryCta", "authorMd"] },
  { key: "voice", label: "Voice", fields: ["voiceMd", "rulesMd"] },
  { key: "channels", label: "Channels", fields: ["channelsMd"] },
  { key: "process", label: "Writing Process", fields: ["processMd", "blogStylesMd", "editingLensMd", "seoLensMd", "imageStyleMd"] },
  { key: "styles", label: "Styles", fields: [] },
];

const LABELS: Record<FieldKey, { label: string; hint?: string; rows: number; input?: boolean }> = {
  positioning: { label: "Positioning", hint: "What the brand is and what it sells.", rows: 3 },
  audience: { label: "Audience", hint: "Who we are writing to.", rows: 3 },
  offer: { label: "Offer", hint: "What we sell.", rows: 2, input: true },
  primaryCta: { label: "Primary CTA", hint: "The default call to action.", rows: 2, input: true },
  authorMd: { label: "Author & credentials", hint: "Who is speaking, and the credentials to draw on.", rows: 6 },
  voiceMd: { label: "Voice", hint: "Tone and how this brand sounds.", rows: 6 },
  rulesMd: { label: "Hard rules", hint: "Non-negotiables: em dashes, name casing, do and don't.", rows: 6 },
  channelsMd: { label: "Channel guidelines", hint: "Per-channel rules. Use ## Blog / ## LinkedIn / ## Facebook / ## Email sections.", rows: 18 },
  processMd: { label: "Workflow", hint: "The steps a post moves through.", rows: 10 },
  blogStylesMd: { label: "Blog styles", hint: "The catalogue and the styles this brand reaches for.", rows: 8 },
  editingLensMd: { label: "Editing lens (Shipper)", hint: "The checklist a draft is run through before approval.", rows: 8 },
  seoLensMd: { label: "SEO lens (Patel)", hint: "The checklist the SEO pass is run through.", rows: 10 },
  imageStyleMd: { label: "Image style", hint: "Brand palette, fonts, and real-vs-AI guidance.", rows: 8 },
};

type Note = { tone: "ok" | "err"; text: string } | null;

export function BrandProfileTabs({ profile }: { profile: BrandProfile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(TABS[0].key);
  const [note, setNote] = useState<Note>(null);

  const [values, setValues] = useState<Record<FieldKey, string>>({
    positioning: profile.positioning ?? "",
    audience: profile.audience ?? "",
    offer: profile.offer ?? "",
    primaryCta: profile.primaryCta ?? "",
    authorMd: profile.authorMd ?? "",
    voiceMd: profile.voiceMd ?? "",
    rulesMd: profile.rulesMd ?? "",
    channelsMd: profile.channelsMd ?? "",
    processMd: profile.processMd ?? "",
    blogStylesMd: profile.blogStylesMd ?? "",
    editingLensMd: profile.editingLensMd ?? "",
    seoLensMd: profile.seoLensMd ?? "",
    imageStyleMd: profile.imageStyleMd ?? "",
  });

  const [blogTypes, setBlogTypes] = useState<string[]>(profile.preferredBlogTypes);
  const [imageStyles, setImageStyles] = useState<string[]>(profile.preferredImageStyles);
  const [socialStyles, setSocialStyles] = useState<string[]>(profile.preferredSocialStyles);

  function set(key: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function saveStyles() {
    setNote(null);
    startTransition(async () => {
      const r = await saveBrandProfile(profile.brandId, {
        preferredBlogTypes: blogTypes,
        preferredImageStyles: imageStyles,
        preferredSocialStyles: socialStyles,
      });
      if (r.ok) {
        setNote({ tone: "ok", text: "Saved." });
        router.refresh();
      } else {
        setNote({ tone: "err", text: r.error });
      }
    });
  }

  function saveTab(fields: FieldKey[]) {
    setNote(null);
    const patch: Partial<Record<FieldKey, string>> = {};
    for (const f of fields) patch[f] = values[f];
    startTransition(async () => {
      const r = await saveBrandProfile(profile.brandId, patch);
      if (r.ok) {
        setNote({ tone: "ok", text: "Saved." });
        router.refresh();
      } else {
        setNote({ tone: "err", text: r.error });
      }
    });
  }

  const current = TABS.find((t) => t.key === active) ?? TABS[0];

  return (
    <div>
      <div className="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === active}
            className={`admin-tab${t.key === active ? " is-active" : ""}`}
            onClick={() => { setActive(t.key); setNote(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-tab-panel">
        <section className="admin-card admin-section-card">
          {note && (
            <div className={`admin-alert admin-alert--${note.tone} u-mb-3`}>
              {note.text}
            </div>
          )}

          {active === "styles" ? (
            <div className="admin-form">
              <StyleGroup title="Preferred blog types" options={BLOG_TYPES} selected={blogTypes} onToggle={(v) => toggle(blogTypes, setBlogTypes, v)} />
              <StyleGroup title="Preferred image styles" options={IMAGE_STYLES} selected={imageStyles} onToggle={(v) => toggle(imageStyles, setImageStyles, v)} />
              <StyleGroup title="Preferred social post styles" options={SOCIAL_STYLES} selected={socialStyles} onToggle={(v) => toggle(socialStyles, setSocialStyles, v)} />
              <div className="admin-form-actions">
                <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={saveStyles}>
                  {pending ? "Saving…" : "Save Styles"}
                </button>
              </div>
            </div>
          ) : (
          <div className="admin-form">
            {current.fields.map((f) => {
              const meta = LABELS[f];
              return (
                <div className="admin-field" key={f}>
                  <label className="admin-label">{meta.label}</label>
                  {meta.input ? (
                    <input className="admin-input" value={values[f]} onChange={(e) => set(f, e.target.value)} />
                  ) : (
                    <textarea className="admin-textarea" rows={meta.rows} value={values[f]} onChange={(e) => set(f, e.target.value)} />
                  )}
                  {meta.hint && <div className="admin-hint">{meta.hint}</div>}
                </div>
              );
            })}
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={pending}
                onClick={() => saveTab(current.fields)}
              >
                {pending ? "Saving…" : `Save ${current.label}`}
              </button>
            </div>
          </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StyleGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: StyleOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="admin-field">
      <span className="admin-label">{title}</span>
      <div className="u-stack u-mt-2">
        {options.map((o) => (
          <label key={o.value} className="u-row-top">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} className="u-mt-1" />
            <span>
              <strong className="u-strong">{o.label}</strong>
              <span className="admin-hint u-inline u-ml-2">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
