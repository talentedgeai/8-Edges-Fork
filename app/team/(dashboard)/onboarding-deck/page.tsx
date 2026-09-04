import { requireTeamMember } from "@/lib/team-auth";
import { OnboardingDeckEmbed } from "@/components/company/OnboardingDeckEmbed";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding Deck" };

// /team/onboarding-deck — the team onboarding deck, embedded so members stay
// inside the portal. Same shared component as /admin/company/onboarding-deck.
export default async function TeamOnboardingDeckPage() {
  await requireTeamMember();
  return <OnboardingDeckEmbed />;
}
