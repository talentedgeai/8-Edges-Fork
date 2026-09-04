import Link from "next/link";

// Site-wide 404. Sits inside the root layout, so SiteFrame's nav and footer
// stay around it.
export default function SiteNotFound() {
  return (
    <section className="section">
      <div className="container u-center-text">
        <h1 className="site-section-title site-section-title--sm">Page not found</h1>
        <p className="site-section-sub site-section-sub--centered">
          The page you were looking for does not exist or has moved.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to home
        </Link>
      </div>
    </section>
  );
}
