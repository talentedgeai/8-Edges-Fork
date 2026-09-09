import { PageHead } from "@/kernel/ui/PageHead";

export const ONBOARDING_DECK_PATH = "/workflows/private/e8/team-onboarding";

// The onboarding deck lives as a standalone full-screen page (it locks body
// scroll, owns the arrow keys, and writes the slide number to the URL hash).
// Embedding it in an iframe keeps all of that inside the frame so the team
// and admin shells stay around it. Shared by /team and /admin/company.
export function OnboardingDeckEmbed() {
  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Onboarding Deck"
        sub="Click the deck, then use the arrow keys or the on-screen controls to move between slides."
        action={
          <a className="admin-btn" href={ONBOARDING_DECK_PATH} target="_blank" rel="noopener">
            Open full screen
          </a>
        }
      />
      <iframe src={ONBOARDING_DECK_PATH} title="Edge8 onboarding deck" className="admin-deck-frame" />
    </>
  );
}
