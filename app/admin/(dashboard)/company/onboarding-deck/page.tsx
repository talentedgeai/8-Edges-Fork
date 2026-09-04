import { requireAdmin } from "@/lib/admin-auth";
import { OnboardingDeckEmbed } from "@/components/company/OnboardingDeckEmbed";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding Deck" };

// /admin/company/onboarding-deck — the same embedded deck the team sees.
export default async function AdminOnboardingDeckPage() {
  await requireAdmin();
  return <OnboardingDeckEmbed />;
}
