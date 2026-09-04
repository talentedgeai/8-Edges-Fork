import Link from "next/link";

type LinkRef = { href: string; label: string };

const DEFAULT_BACK: LinkRef = {
  href: "/the-vietnam-experience",
  label: "The Vietnam Experience",
};

/**
 * Shared shell for every Vietnam Experience sub-page: a back link, the article
 * body, and an onward "next" link. The site Nav/Footer come from SiteFrame.
 */
export function SubpageFrame({
  children,
  back = DEFAULT_BACK,
  next,
}: {
  children: React.ReactNode;
  back?: LinkRef;
  next?: LinkRef;
}) {
  return (
    <div className="site-xp-page">
      <article className="site-xp-article">
        <Link href={back.href} className="site-xp-backlink">
          ← {back.label}
        </Link>

        {children}

        <nav className="site-xp-onward">
          <Link href={back.href} className="site-xp-backlink">
            ← Back to {back.label}
          </Link>
          {next && (
            <Link href={next.href} className="site-xp-next">
              Next: {next.label}
              <span className="ar" aria-hidden>→</span>
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead: string;
}) {
  return (
    <header className="site-xp-article-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="site-xp-lead">{lead}</p>
    </header>
  );
}

export function Block({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="site-xp-block">
      <h2>{heading}</h2>
      <div className="site-xp-body">{children}</div>
    </section>
  );
}
