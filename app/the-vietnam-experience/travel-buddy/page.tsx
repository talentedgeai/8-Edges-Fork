import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "Travel Buddy · The Vietnam Experience",
  description:
    "Travel Buddy is your AI concierge for the week, and the clearest example of the leverage you came to learn, small enough to hold in your hand.",
  alternates: { canonical: "/the-vietnam-experience/travel-buddy" },
};

export default function TravelBuddyPage() {
  return (
    <SubpageFrame next={{ href: "/the-vietnam-experience/infinite-leverage", label: "Infinite Leverage" }}>
      <PageHeader
        eyebrow="Travel Buddy"
        title="A guide in your pocket."
        lead="Travel Buddy is your AI concierge for the week. It is also the clearest example of the leverage you came to learn, the kind you can hold in your hand."
      />

      <PlaceholderImage
        label="Photo: Travel Buddy on a phone"
        aspect="16 / 9"
        style={{ marginTop: 40 }}
      />

      <div className="xp-blocks">
        <Block heading="What it does">
          <p>
            Where to eat, how to get there, and what is worth your time. Travel Buddy
            quietly handles the details so you are never standing on a corner wondering
            what is next.
          </p>
        </Block>

        <Block heading="Built by the same team">
          <p>
            The people running your week are the people who build the app. It is AI made
            genuinely useful, not a demo. You will be using the same kind of system you
            came here to learn to build.
          </p>
          <PlaceholderImage
            label="Photo: the team who build it"
            src="/experience/pair-programming.jpg"
            alt="An engineer walking a guest through the build on a laptop"
            aspect="4 / 3"
            maxWidth="30rem"
          />
        </Block>

        <Block heading="It learns you">
          <p>
            It adapts to your taste, your pace, and your plans. By the third day it knows
            you take your coffee strong and your evenings slow.
          </p>
        </Block>

        <Block heading="Leverage you can hold">
          <p>
            One app does the work of a concierge, a guide, and a local friend at once,
            all day, without tiring. That is infinite leverage, made small enough to fit
            in your pocket.
          </p>
        </Block>
      </div>

      <div style={{ marginTop: 48 }}>
        <a
          href="https://travelbuddy8.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          Open Travel Buddy <span className="arrow" aria-hidden>↗</span>
        </a>
      </div>
    </SubpageFrame>
  );
}
