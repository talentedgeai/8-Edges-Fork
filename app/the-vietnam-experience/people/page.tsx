import type { Metadata } from "next";
import Link from "next/link";
import { SubpageFrame, PageHeader } from "@/components/experience/Subpage";
import { PlaceholderImage } from "@/components/experience/PlaceholderImage";

export const metadata: Metadata = {
  title: "The People · The Vietnam Experience",
  description:
    "Not a hotel. A small team who built this for you and learned your name before you arrived. Meet Dave, Quan, Trac, and the crew.",
  alternates: { canonical: "/the-vietnam-experience/people" },
};

const MAIN = [
  {
    name: "Dave",
    title: "CAIO",
    href: "/the-vietnam-experience/people/dave",
    blurb: "Your host, and the reason the week exists.",
  },
  {
    name: "Quan",
    title: "Retreat Host",
    href: "/the-vietnam-experience/people/quan",
    blurb: "The one who makes every day feel effortless.",
  },
  {
    name: "Trac",
    title: "Lead Engineer",
    href: "/the-vietnam-experience/people/trac",
    blurb: "Who builds the AI behind all of it.",
  },
];

export default function PeoplePage() {
  return (
    <SubpageFrame>
      <PageHeader
        eyebrow="The People"
        title="The people who make it yours."
        lead="Not a hotel. A small team who built this for you, and learned your name before you arrived."
      />

      <div className="xp-people-grid">
        {MAIN.map((p) => (
          <Link key={p.href} href={p.href} className="xp-person-card">
            <PlaceholderImage label={`Photo: ${p.name}`} aspect="4 / 5" style={{ marginBottom: 16 }} />
            <div className="xp-person-top">
              <h2>{p.name}</h2>
              <span className="ti">{p.title}</span>
            </div>
            <p className="blurb">{p.blurb}</p>
            <span className="meet">
              Meet {p.name}
              <span className="ar" aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 56 }}>
        <h2
          className="h-section"
          style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 8 }}
        >
          And the team
        </h2>
        <ul className="xp-team-list">
          <li>
            <span className="nm">Tam</span>, who has cared for this home for eighteen years.
          </li>
          <li>
            <span className="nm">My</span>, the Retreat Coordinator, who keeps every day
            running on time.
          </li>
          <li>
            <span className="nm">Kay</span> and <span className="nm">Luke</span>, who build
            alongside Trac.
          </li>
          <li>
            <span className="nm">Vu</span>, your driver and a man this country calls a hero.{" "}
            <Link href="/the-vietnam-experience/arrival">Meet him in The Arrival</Link>.
          </li>
        </ul>
      </div>
    </SubpageFrame>
  );
}
