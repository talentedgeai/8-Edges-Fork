import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/components/admin/PageHead";
import { requireAdmin } from "@/lib/admin-auth";
import { listBrandProfiles } from "@/lib/admin/brand-profiles";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Brands",
  description: "Voice, channels, and the writing process each brand's content follows.",
};

export default async function BrandsPage() {
  await requireAdmin();
  const brands = await listBrandProfiles();

  return (
    <div>
      <PageHead
        eyebrow={<>Revenue · <Link href="/admin/revenue/marketing">Marketing</Link></>}
        title="Brands"
        sub="Each brand's voice, channels, and writing process. The broadcast editor and the AI writer read from here."
      />

      {brands.length === 0 ? (
        <div className="admin-empty">No active brands.</div>
      ) : (
        <div className="admin-kpi-grid">
          {brands.map((b) => (
            <Link
              key={b.brandId}
              href={`/admin/revenue/marketing/brands/${b.brandSlug}`}
              className="admin-card admin-section-card u-block u-link-plain"
            >
              <div className="admin-card-title">{b.brandName}</div>
              <p className="admin-page-sub u-mt-2">
                {b.positioning ?? "No profile yet."}
              </p>
              <span className="admin-btn admin-btn--sm u-mt-3">
                Edit profile
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
