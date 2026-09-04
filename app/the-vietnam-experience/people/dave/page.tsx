import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "Dave · The Vietnam Experience",
  description:
    "Dave is your host and the CAIO. He spent years learning to lead AI rather than chase it, and built the retreat to hand that to other people.",
  alternates: { canonical: "/the-vietnam-experience/people/dave" },
};

const BACK = { href: "/the-vietnam-experience/people", label: "The People" };

export default function DavePage() {
  return (
    <SubpageFrame back={BACK} next={{ href: "/the-vietnam-experience/people/quan", label: "Quan" }}>
      <PageHeader
        eyebrow="Dave · CAIO"
        title="Dave"
        lead="Your host, and the reason the week exists. He spent years learning to lead AI rather than chase it, and built this retreat to hand that to other people."
      />

      <PlaceholderImage label="Photo: Dave" aspect="4 / 5" maxWidth="24rem" style={{ marginTop: 40 }} />

      <div className="xp-blocks">
        <Block heading="Why he built this">
          <p>
            Dave got tired of watching smart people learn to use AI when they could be
            leading it. The retreat is the shortest path he knows from one to the other,
            built around the way he actually works.
          </p>
        </Block>

        <Block heading="What the retreat is built on">
          <p>
            Dave designed the retreat and built the team around it. You work with your
            AI Engineer and Quan day to day, with specialists brought in as the work
            requires. Dave may join in person or be available remotely. Either way, the
            system he built is what makes the week run.
          </p>
          <p className="xp-aside">
            A fuller profile, in his own words, is being written for this page.
          </p>
        </Block>
      </div>
    </SubpageFrame>
  );
}
