import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";
import { PhotoSlider } from "@/components/experience/PhotoSlider";

const AIO_PAD_URL = "https://www.aio-pad.com";

export const metadata: Metadata = {
  title: "The Place · The Vietnam Experience",
  description:
    "Saigon, and a neighborhood called Thao Dien. The leafy riverside pocket where you live for a few days, and the AIO Pad, the high-floor apartment you work and stay in.",
  alternates: { canonical: "/the-vietnam-experience/place" },
};

const AIO_PAD_PHOTOS = [
  { src: "/experience/aio-pad-living.jpg", alt: "The AIO Pad living room with the river through the balcony doors", caption: "The living room" },
  { src: "/experience/aio-pad-desk.jpg", alt: "A work desk with an external monitor and the Saigon river beyond the window", caption: "Set up to work" },
  { src: "/experience/aio-pad-room.jpg", alt: "A bedroom on a high floor with a desk and the river below", caption: "A room with the river below" },
  { src: "/experience/aio-pad-kitchen.jpg", alt: "The full kitchen and dining table at the AIO Pad", caption: "Full kitchen" },
];

export default function PlacePage() {
  return (
    <SubpageFrame next={{ href: "/the-vietnam-experience/travel-buddy", label: "Travel Buddy" }}>
      <PageHeader
        eyebrow="The Place"
        title="Saigon, and a neighborhood called Thao Dien."
        lead="For a few days you do not visit Saigon. You live in it, in the leafy riverside pocket where the locals, the creatives, and the AIO Pad all are."
      />

      <PlaceholderImage
        label="Photo: Thao Dien at golden hour"
        src="/experience/place-river-golden.jpg"
        alt="The Saigon river bending gold past Thao Dien at golden hour"
        aspect="16 / 9"
        style={{ marginTop: 40 }}
      />

      <div className="xp-blocks">
        <Block heading="Thao Dien">
          <p>
            Thao Dien is the green, walkable corner of the city, a short ride from the
            noise of District 1 and a world away from it. Espresso bars, weekend markets,
            riverside restaurants, and streets you actually want to walk.
          </p>
          <p>
            You wake up in a neighborhood, not a hotel lobby, with the river a few minutes
            one way and a sidewalk coffee the other.
          </p>
          <PlaceholderImage
            label="Photo: a Thao Dien street corner"
            src="/experience/place-thaodien.jpg"
            alt="A leafy street-corner cafe in Saigon, motorbikes parked along the kerb"
            aspect="3 / 2"
          />
        </Block>

        <Block heading="The coffee">
          <p>
            You will learn the ritual of ca phe sua da: strong coffee dripped slowly over
            sweet condensed milk, then poured over ice. You will have it every morning,
            and you will miss it the day you leave.
          </p>
          <PlaceholderImage
            label="Photo: a sidewalk coffee cart"
            src="/experience/place-coffee.jpg"
            alt="A sidewalk coffee cart with red plastic stools in a Saigon alley"
            aspect="4 / 5"
            maxWidth="24rem"
          />
        </Block>

        <Block heading="The food">
          <p>
            The best meal of your trip will cost a few dollars and arrive at a plastic
            table on a sidewalk. We will take you to the places the locals go, and to the
            ones Travel Buddy quietly knows about.
          </p>
          <PlaceholderImage
            label="Photo: a Saigon street-food cart"
            src="/experience/place-food.jpg"
            alt="A Saigon street-food cart lit up at night"
            aspect="1 / 1"
            maxWidth="26rem"
          />
        </Block>

        <Block heading="The river">
          <p>
            At the end of each day the river turns gold and the pace slows. You will
            understand quickly why the people who live here never plan to leave.
          </p>
        </Block>

        <Block heading="Why you stay here, not in a hotel">
          <p>
            A hotel keeps you a guest. A home in Thao Dien makes you a local for a week.
            That is the difference between seeing a place and feeling it, and it is the
            whole point.
          </p>
        </Block>
      </div>

      {/* The home base: the AIO Pad apartment */}
      <section className="xp-aiopad">
        <p className="eyebrow">Where you stay</p>
        <h2>The AIO Pad</h2>
        <p className="xp-aiopad-lead">
          Your home base for the week: a high-floor apartment in Thao Dien with the Saigon
          river below, set up so you can land and start working the same hour.
        </p>

        <PhotoSlider photos={AIO_PAD_PHOTOS} ratio="3 / 2" />

        <ul className="xp-aiopad-features">
          <li>
            <span>
              <strong>No early check-in or late checkout limits.</strong> The apartment is
              yours on your schedule, not the front desk&rsquo;s.
            </span>
          </li>
          <li>
            <span>
              <strong>Equipped to work the moment you arrive.</strong> Power and universal
              adaptors, external monitors, and the fastest internet available in Saigon.
            </span>
          </li>
          <li>
            <span>
              <strong>A high floor in Thao Dien</strong> with the river below and the
              neighborhood, its cafes, food, and markets, at the door.
            </span>
          </li>
        </ul>

        <div className="xp-aiopad-cta">
          <a href={AIO_PAD_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Book the AIO Pad <span className="arrow" aria-hidden>↗</span>
          </a>
        </div>
      </section>
    </SubpageFrame>
  );
}
