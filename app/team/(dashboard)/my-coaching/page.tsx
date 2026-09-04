import { redirect } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { getMyCoaching } from "@/lib/coaching/data";
import { coachingMarkdownToHtml } from "@/lib/coaching/markdown";
import { MyCoachingHeader } from "@/components/coaching/MyCoachingHeader";
import { MyCoachingView } from "@/components/coaching/MyCoachingView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My coaching",
  description: "Your FAST goals, priorities, OCEAN profile, commitments, and 1-1 recaps.",
};

// /team/my-coaching - the member tier. getMyCoaching selects ONLY
// member-visible fields (goal, company goals, commitments, PUBLISHED recaps,
// check-ins); the private coaching tier never reaches this page's data.
export default async function MyCoachingPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const actor = await requireTeamMember();
  const my = await getMyCoaching(actor);
  if (!my) redirect("/team");

  const [recapsHtml, checkinsHtml] = await Promise.all([
    Promise.all(my.recaps.map((r) => coachingMarkdownToHtml(r.sharedSummaryMarkdown))),
    Promise.all(my.checkins.map((c) => coachingMarkdownToHtml(c.messageMarkdown))),
  ]);

  const recaps = my.recaps.map((r, i) => ({ id: r.id, heldOn: r.heldOn, html: recapsHtml[i], agenda: r.agenda }));
  const checkins = my.checkins.map((c, i) => ({
    id: c.id,
    sentAt: c.sentAt,
    respondedAt: c.respondedAt,
    html: checkinsHtml[i],
  }));

  return (
    <>
      <MyCoachingHeader my={my} />
      <MyCoachingView
        coachName={my.coachName}
        goals={my.goals}
        priorities={my.priorities}
        ocean={my.ocean}
        commitments={my.commitments}
        talkingPoints={my.talkingPoints}
        teamMemberId={actor.teamMemberId}
        recaps={recaps}
        checkins={checkins}
        initialTab={searchParams?.tab}
      />
    </>
  );
}
