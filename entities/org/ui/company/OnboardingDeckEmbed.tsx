import { PageHead } from "@/kernel/ui/PageHead";
import { ONBOARDING_DECK_URL } from "@/kernel/config/organisation";

// The onboarding deck lives as a standalone full-screen page (it locks body
// scroll, owns the arrow keys, and writes the slide number to the URL hash).
// Embedding it in an iframe keeps all of that inside the frame so the team
// and admin shells stay around it. Shared by /team and /admin/company.
//
// The URL is configuration: upstream's deck is one of the 76 documents in the
// private workflows library, which is internal and never syncs. Hardcoded here
// it rendered an iframe onto a 404 in every fork, and put an internal document
// path into a file that ships. The sidebars hide the entry when it is unset,
// so this empty state is a safety net rather than the normal way in.
export function OnboardingDeckEmbed() {
  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Onboarding Deck"
        sub={
          ONBOARDING_DECK_URL
            ? "Click the deck, then use the arrow keys or the on-screen controls to move between slides."
            : "No onboarding deck is configured for this workspace."
        }
        action={
          ONBOARDING_DECK_URL ? (
            <a className="admin-btn" href={ONBOARDING_DECK_URL} target="_blank" rel="noopener">
              Open full screen
            </a>
          ) : undefined
        }
      />
      {ONBOARDING_DECK_URL && (
        <iframe src={ONBOARDING_DECK_URL} title="Onboarding deck" className="admin-deck-frame" />
      )}
    </>
  );
}
