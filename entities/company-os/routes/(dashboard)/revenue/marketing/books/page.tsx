import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { listBooks } from "@/entities/company-os/modules/campaigns/books";

export const metadata: Metadata = {
  title: "Books",
  description: "The long-form manuscripts: read them in-app, repurpose them into posts.",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published_web: "Published on web",
  published_amazon: "Published on Amazon",
};

export default async function BooksPage() {
  await requireAdmin();
  const books = await listBooks();

  return (
    <div>
      <PageHead
        eyebrow={<>Revenue · <Link href="/admin/revenue/marketing">Marketing</Link></>}
        title="Books"
        sub="The manuscripts, chapter by chapter. Raw material for blog posts and social, and the source for the Amazon editions."
      />

      {books.length === 0 ? (
        <div className="admin-empty">No books imported yet.</div>
      ) : (
        <div className="admin-kpi-grid">
          {books.map((b) => (
            <Link
              key={b.id}
              href={`/admin/revenue/marketing/books/${b.slug}`}
              className="admin-card admin-section-card admin-book-card-link"
            >
              <div className="admin-card-title">{b.title}</div>
              {b.subtitle ? (
                <p className="admin-page-sub u-mt-1">{b.subtitle}</p>
              ) : null}
              <p className="admin-page-sub u-mt-2">{b.description}</p>
              <div className="admin-book-card-meta">
                <Badge tone={b.status === "draft" ? "info" : "ok"}>
                  {STATUS_LABEL[b.status] ?? b.status}
                </Badge>
                <Badge tone="neutral">{b.format === "fable" ? "Fable" : "Nonfiction"}</Badge>
                <span className="admin-cell-muted">{b.chapterCount} chapters</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
