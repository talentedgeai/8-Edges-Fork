"use client";

import { blogPreviewFamily, blogTypeLabel } from "@/lib/marketing/style-catalogues";

// Full-page render of a blog asset, matching the live /post/[slug] layout:
// cover image, meta row, title, article typography. The presentation family
// (statement / structured / analytical / narrative) follows the chosen blog
// style via the .admin-campaign-blogprev--{family} variants in admin.css.
export function BlogPreview({
  title,
  html,
  blogStyle,
  categoryLabel,
  publishDate,
  copyMd,
  coverUrl,
}: {
  title: string;
  html: string;
  blogStyle: string | null;
  categoryLabel: string | null;
  publishDate: string | null;
  copyMd: string;
  coverUrl: string | null;
}) {
  const family = blogPreviewFamily(blogStyle);
  const words = copyMd.trim() ? copyMd.trim().split(/\s+/).length : 0;
  const readTime = `${Math.max(1, Math.round(words / 200))} min read`;
  const dateLabel = publishDate
    ? new Date(`${publishDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className={`admin-campaign-blogprev${family ? ` admin-campaign-blogprev--${family}` : ""}`}>
      {coverUrl && (
        <div className="admin-campaign-blogprev-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt={title} />
        </div>
      )}
      <div className="admin-campaign-blogprev-inner">
        <div className="admin-campaign-blogprev-meta">
          {categoryLabel && <span className="admin-campaign-blogprev-tag">{categoryLabel}</span>}
          {dateLabel && <span>{dateLabel}</span>}
          <span>{readTime}</span>
        </div>
        {blogStyle && (
          <div className="admin-campaign-blogprev-eyebrow">{blogTypeLabel(blogStyle)}</div>
        )}
        <h1 className="admin-campaign-blogprev-title">{title}</h1>
        <div className="admin-campaign-blogprev-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
