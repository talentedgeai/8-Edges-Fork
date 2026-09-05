import { requireAdmin } from "@/kernel/identity/admin-auth";
import { OnboardingDeckEmbed } from "@/entities/company-os/ui/company/OnboardingDeckEmbed";

export const metadata = { title: "Onboarding Deck" };

// /admin/company/onboarding-deck — the same embedded deck the team sees.
export default async function AdminOnboardingDeckPage() {
  await requireAdmin();
  return <OnboardingDeckEmbed />;
}
