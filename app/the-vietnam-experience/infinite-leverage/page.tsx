import type { Metadata } from "next";
import Link from "next/link";
import { SubpageFrame, PageHeader, Block } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "Infinite Leverage · The Vietnam Experience",
  description:
    "Everything this week is one idea made real with AI. Infinite leverage is building things that keep working without you. The idea you take home.",
  alternates: { canonical: "/the-vietnam-experience/infinite-leverage" },
};

export default function InfiniteLeveragePage() {
  return (
    <SubpageFrame next={{ href: "/the-vietnam-experience/people", label: "The People" }}>
      <PageHeader
        eyebrow="Infinite Leverage"
        title="The idea you take home."
        lead="Everything this week is one idea made real with AI. Infinite leverage is building things that keep working without you. Once you have seen it up close, you cannot unsee it."
      />

      <PlaceholderImage
        label="Photo: a session at the retreat"
        src="/experience/session-whiteboard-method.jpg"
        alt="A working session, the method on the whiteboard behind: context, skills, workflow, routines"
        aspect="16 / 9"
        style={{ marginTop: 40 }}
      />

      <div className="xp-blocks">
        <Block heading="Using AI, or leading it">
          <p>
            Most people are learning to use AI. You came to lead it: to build systems
            that run on their own and do the work while you sleep. That shift, from
            operator to owner, is the whole game.
          </p>
        </Block>

        <Block heading="The work of fifty">
          <p>
            A small team, leveraged well, does the work of a company many times its size.
            This week you meet that team and see exactly how they do it.
          </p>
          <PlaceholderImage
            label="Photo: the team at work"
            src="/experience/team-room.jpg"
            alt="The full group gathered around a screen, working through a build together"
            aspect="16 / 9"
          />
        </Block>

        <Block heading="You have already felt it">
          <p>
            The arrival arranged before you landed. The app in your pocket. The home that
            runs itself. None of it was magic. It was leverage, working quietly in the
            background, which is exactly what it should feel like from the inside.
          </p>
        </Block>

        <Block heading="What the retreat teaches">
          <p>
            You do not sit and take notes. You build a leveraged system of your own, with
            the team beside you, and you leave with something real and running.
          </p>
          <PlaceholderImage
            label="Photo: mapping a workflow at the whiteboard"
            src="/experience/whiteboard-diagram.jpg"
            alt="An engineer and a guest mapping a workflow on the whiteboard, the team beside them"
            aspect="4 / 3"
            maxWidth="34rem"
          />
        </Block>

        <Block heading="Take it home">
          <p>
            The point was never a week in Saigon. It is the way you work for the next ten
            years. You take the idea home, and it keeps paying you back long after the
            flight.
          </p>
        </Block>
      </div>

      <div style={{ marginTop: 48 }}>
        <Link href="/saigon" className="btn btn-primary">
          Explore the retreat <span className="arrow" aria-hidden>→</span>
        </Link>
      </div>
    </SubpageFrame>
  );
}
