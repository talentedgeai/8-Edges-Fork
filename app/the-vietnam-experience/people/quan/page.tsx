import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "Quan · The Vietnam Experience",
  description:
    "Quan is the Retreat Host. He is the reason the week feels effortless: the car is there, the table is booked, and you never think about logistics.",
  alternates: { canonical: "/the-vietnam-experience/people/quan" },
};

const BACK = { href: "/the-vietnam-experience/people", label: "The People" };

export default function QuanPage() {
  return (
    <SubpageFrame back={BACK} next={{ href: "/the-vietnam-experience/people/trac", label: "Trac" }}>
      <PageHeader
        eyebrow="Quan · Retreat Host"
        title="Quan"
        lead="The reason the week feels effortless. Quan is the one who makes sure the car is there, the table is booked, and you never have to think about logistics."
      />

      <PlaceholderImage label="Photo: Quan" aspect="4 / 5" maxWidth="24rem" style={{ marginTop: 40 }} />

      <div className="xp-blocks">
        <Block heading="What he does">
          <p>
            Quan runs the week on the ground so that you can be fully present for it. The
            mornings, the meals, the rides across town: he has thought about them before
            you have, and handled them before you notice.
          </p>
          <p>
            He is also the warmth of the week. By day two he feels less like a host and
            more like a friend who happens to know the whole city.
          </p>
          <p className="xp-aside">
            A fuller profile, in his own words, is being written for this page.
          </p>
        </Block>
      </div>
    </SubpageFrame>
  );
}
