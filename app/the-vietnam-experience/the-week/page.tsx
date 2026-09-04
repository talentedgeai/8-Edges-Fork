import type { Metadata } from "next";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "The Week · The Vietnam Experience",
  description:
    "Three to five days in Saigon. 9am to 6pm, you work. Every evening, Saigon is yours.",
  alternates: { canonical: "/the-vietnam-experience/the-week" },
};

export default function TheWeekPage() {
  return (
    <SubpageFrame next={{ href: "/the-vietnam-experience/arrival", label: "The Arrival" }}>
      <PageHeader
        eyebrow="The Week"
        title="Three to five days of real work. Every evening, Saigon is yours."
        lead="This is an AI retreat. You come to work. Nine in the morning until six in the evening, every day. Then the city takes over."
      />

      <PlaceholderImage
        label="Photo: a working session at the AIO Pad"
        src="/experience/session-saigon-window.jpg"
        alt="A working session at a riverside table, the Saigon skyline through the window"
        aspect="16 / 9"
        style={{ marginTop: 40 }}
      />

      <div className="xp-blocks">
        <Block heading="The working day">
          <p>
            9am to 6pm, every day. Focused, hands-on work on AI and infinite leverage
            with your AI Engineer and Quan, your Retreat Host. Specialists are available
            as needed. You are not here to watch a presentation. You
            are here to build something real, and by the end of the week you will have.
          </p>
          <p>
            The sessions are intensive because that is the only way the ideas actually
            land. By day two, you will be thinking differently.
          </p>
          <PlaceholderImage
            label="Photo: hands-on at the table"
            src="/experience/session-cafe.jpg"
            alt="Guests and engineers working side by side at a wooden table"
            aspect="16 / 9"
          />
        </Block>

        <Block heading="Day one: arrive and begin">
          <p>
            You land, clear immigration without a line, and ride to the AIO Pad in
            Thao Dien. The apartment is ready, the coffee is on, and by evening you are
            already in the city, eating well, getting your bearings.
          </p>
          <p>
            The first working session starts the next morning at nine.
          </p>
        </Block>

        <Block heading="The working days">
          <p>
            Each day follows the same clean arc. You work from 9am to 6pm with your AI
            Engineer and Quan on infinite leverage, AI systems, and building things that
            keep working without you. Hard work, real output.
          </p>
          <p>
            At six o'clock, the day ends and Saigon begins.
          </p>
          <PlaceholderImage
            label="Photo: a working session"
            src="/experience/session-focus.jpg"
            alt="A small group heads-down at their laptops in a working session"
            aspect="16 / 9"
          />
        </Block>

        <Block heading="Every evening: the city">
          <p>
            Food. Music. Shopping. Rest. Saigon at night is a different city entirely,
            and it is yours from 6pm. Vu drives, Travel Buddy guides, and the team
            knows where to go.
          </p>
          <p>
            Some nights you will sit by the river and not want to move. That is also
            the right answer.
          </p>
        </Block>

        <Block heading="The last day: take it home">
          <p>
            You finish the week with a working system of your own and a plan for how
            you use it. Not a notebook of ideas. Something real, already running.
          </p>
          <p>
            A final dinner, the river going gold, and a way of working that does not
            switch off when you fly home.
          </p>
          <PlaceholderImage
            label="Photo: the week's plan, sketched"
            src="/experience/workplan-sketch.jpg"
            alt="A hand-drawn plan mapping the AI team and agents to the week's work"
            aspect="4 / 3"
            maxWidth="34rem"
          />
        </Block>

        <Block heading="Three days, or five">
          <p>
            Three days is the minimum for the ideas to take hold. Five gives them room
            to settle, and more evenings in the city. Tell us how long you have.
          </p>
        </Block>
      </div>
    </SubpageFrame>
  );
}
