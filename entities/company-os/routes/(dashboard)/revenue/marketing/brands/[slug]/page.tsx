import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { getBrandProfileBySlug } from "@/entities/company-os/modules/campaigns/brand-profiles";
import { BrandProfileTabs } from "./BrandProfileTabs";

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
