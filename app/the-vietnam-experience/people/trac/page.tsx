import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "Trac · The Vietnam Experience",
  description:
    "Trac leads the engineering. He and the team build the AI that runs the apartment, guides you through the city, and arranges your arrival before you land.",
  alternates: { canonical: "/the-vietnam-experience/people/trac" },
};

const BACK = { href: "/the-vietnam-experience/people", label: "The People" };

export default function TracPage() {
  return (
    <SubpageFrame back={BACK}>
      <PageHeader
        eyebrow="Trac · Lead Engineer"
        title="Trac"
        lead="Trac leads the engineering. He and the team build the AI that runs the apartment, guides you through the city, and arranges your arrival long before you land."
      />

      <PlaceholderImage label="Photo: Trac" aspect="4 / 5" maxWidth="24rem" style={{ marginTop: 40 }} />

      <div className="xp-blocks">
        <Block heading="What he builds">
          <p>
            Travel Buddy, the booking systems, the quiet automations that make the week
            run: Trac and the team build all of it. When something just works on this
            trip, he is usually the reason.
          </p>
          <p>
            He is also the clearest proof of the idea you came for. A small team, shipping
            like a large one, because every one of them is leveraged by the AI they build.
          </p>
          <p className="xp-aside">
            A fuller profile, in his own words, is being written for this page.
          </p>
        </Block>
      </div>
    </SubpageFrame>
  );
}
