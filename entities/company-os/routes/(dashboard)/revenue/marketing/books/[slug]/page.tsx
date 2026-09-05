import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { getBook } from "@/entities/company-os/modules/campaigns/books";

export const metadata: Metadata = {
  title: "Book",
  description: "Read a book in-app and browse its chapters.",
};

function words(md: string): number {
  return md.split(/\s+/).length;
}

export default async function BookPage({ params }: { params: { slug: string } }) {
  await requireAdmin();
  const result = await getBook(params.slug);
  if (!result) notFound();
  const { book, chapters } = result;
  const totalWords = chapters.reduce((n, c) => n + words(c.bodyMd), 0);

  return (
    <div>
      <PageHead
        eyebrow={
          <>
            <Link href="/admin/revenue/marketing">Marketing</Link> ·{" "}
            <Link href="/admin/revenue/marketing/books">Books</Link>
          </>
        }
        title={book.title}
        sub={book.subtitle ?? undefined}
        action={
          book.readerPath ? (
            <a className="admin-btn" href={book.readerPath} target="_blank" rel="noreferrer">
              Open reader in new tab
            </a>
          ) : undefined
        }
      />

      <p className="admin-page-sub u-mb-4">
        {book.audience ? <>For {book.audience.toLowerCase()}. </> : null}
        {chapters.length} chapters, about {Math.round(totalWords / 100) * 100} words.
        The chapters below are the markdown source the content pipeline reads; the
        reader is the finished book.
      </p>

      {book.readerPath ? (
        <div className="admin-card admin-section-card u-p-0 u-clip">
          <iframe src={book.readerPath} title={book.title} className="admin-book-reader-frame" />
        </div>
      ) : null}

      <div className="admin-card admin-section-card u-mt-4">
        <div className="admin-card-title">Chapters</div>
        <table className="admin-table u-mt-2">
          <thead>
            <tr>
              <th>#</th>
              <th>Part</th>
              <th>Chapter</th>
              <th>Words</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((c) => (
              <tr key={c.id}>
                <td className="admin-cell-muted">{c.sortOrder}</td>
                <td className="admin-cell-muted">{c.part ?? ""}</td>
                <td>{c.title}</td>
                <td className="admin-cell-muted">{words(c.bodyMd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
