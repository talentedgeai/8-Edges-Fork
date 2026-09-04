import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/components/admin/PageHead";
import { requireAdmin } from "@/lib/admin-auth";
import { getBrandProfileBySlug } from "@/lib/admin/brand-profiles";
import { BrandProfileTabs } from "./BrandProfileTabs";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Brand profile",
  description: "Voice, channels, and writing process for a brand.",
};

export default async function BrandProfilePage({ params }: { params: { slug: string } }) {
  await requireAdmin();
  const profile = await getBrandProfileBySlug(params.slug);
  if (!profile) notFound();

  return (
    <div>
      <PageHead
        eyebrow={
          <>
            <Link href="/admin/revenue/marketing">Marketing</Link> ·{" "}
            <Link href="/admin/revenue/marketing/brands">Brands</Link> · Profile
          </>
        }
        title={profile.brandName}
        sub="The voice, channels, and writing process the AI writer follows for this brand."
      />
      <BrandProfileTabs profile={profile} />
    </div>
  );
}
