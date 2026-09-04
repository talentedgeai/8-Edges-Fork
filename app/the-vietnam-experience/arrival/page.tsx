import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "The Arrival · The Vietnam Experience",
  description:
    "From the second you land in Saigon, the week is already arranged around you. The VIP welcome, Vu the driver, and the AI that coordinates it all.",
  alternates: { canonical: "/the-vietnam-experience/arrival" },
};

export default function ArrivalPage() {
  return (
    <SubpageFrame next={{ href: "/the-vietnam-experience/place", label: "The Place" }}>
      <PageHeader
        eyebrow="The Arrival"
        title="From the second you land."
        lead="No one-hour wait at immigration. No taxi line. No scrambling for a Grab. The moment your plane touches down in Saigon, the week has already been arranged around you, by the same AI you came here to learn to lead."
      />

      <PlaceholderImage
        label="Photo: arrivals at Tan Son Nhat"
        aspect="16 / 9"
        style={{ marginTop: 40 }}
      />

      <div className="xp-blocks">
        <Block heading="Someone is waiting with your name.">
          <p>
            An immigration representative meets you right at the entrance to
            immigration, holding a sign with your name. While the rest of your flight
            files into the queue, you are walked straight to the front. Your visa and
            your paperwork were handled before you boarded.
          </p>
          <p>
            By the time the others reach the baggage carousel, you are already
            through. No forms under fluorescent light, no wondering whether you are
            standing in the right line. Just a calm walk to the door, and someone
            carrying your bag.
          </p>
          <PlaceholderImage label="Photo: the VIP fast-track at immigration" aspect="16 / 9" />
        </Block>

        <Block heading="Vu is holding the door.">
          <p>
            Outside, a man this country calls a hero is waiting by the car. His name
            is Vu.
          </p>
          <p>
            Vu served in the special forces on the Cambodia front, in a war where
            most of the Vietnamese who fought beside him never came home. He does
            not talk about it often. When he does, you listen.
          </p>
          <p>
            Today he keeps you safe in the city he once fought for. He has driven
            for Dave for years, and within a day he will know your name, your coffee
            order, and the fastest way to wherever you need to be.
          </p>
          <p className="xp-aside">
            Vu&rsquo;s full story, in his own words, is being recorded for this page.
          </p>
          <PlaceholderImage label="Photo: Vu" aspect="4 / 5" maxWidth="24rem" />
        </Block>

        <Block heading="A silent, electric VinFast.">
          <p>
            The car is a VinFast, Vietnamese built and fully electric. It pulls away
            without a sound. The air conditioning is already on. There is cold water
            in the door.
          </p>
          <p>
            It is a small thing, but it tells you exactly where you are: a country
            that decided not to wait its turn to build the future. You will feel
            that everywhere this week.
          </p>
          <PlaceholderImage label="Photo: the VinFast" aspect="16 / 9" />
        </Block>

        <Block heading="It was all arranged before you boarded.">
          <p>
            The flight time, the pickup, the keys to the apartment, the first coffee
            on the counter: none of it was improvised. It was coordinated by the
            same AI systems the retreat will teach you to build and lead.
          </p>
          <p>
            That is the real point of the arrival. Before a single session begins,
            you have already felt what infinite leverage does. The work happened
            quietly, in advance, so that you could simply arrive.
          </p>
        </Block>
      </div>
    </SubpageFrame>
  );
}
