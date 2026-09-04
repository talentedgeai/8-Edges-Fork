import { notFound } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { getHubOverviewForActor } from "@/lib/team/clients";
import { HubProgramsBand } from "@/components/hub/HubProgramsBand";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Overview" };

// The hub Overview: the same top band as the admin hub home, the read-only
// Human Tokens strip and the AI Programs card grid, each card linking into
// the team program view. The company-wide surfaces (board, roadmap, documents,
// meetings, invoices, team) stay on their own tabs below.
export default async function TeamClientHubOverview({ params }: { params: { companyId: string } }) {
  const actor = await requireTeamMember();
  const overview = await getHubOverviewForActor(actor, params.companyId);
  if (!overview) notFound();

  return (
    <HubProgramsBand
      usage={overview.usage}
      programs={overview.programs}
      programHref={(programId) => `/team/clients/${params.companyId}/programs/${programId}`}
    />
  );
}
