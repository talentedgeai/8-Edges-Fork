import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getHubOverviewForActor } from "@/entities/team/modules/hub/clients";
import { HubProgramsBand } from "@/entities/team/modules/hub/ui/HubProgramsBand";

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
