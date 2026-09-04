import { notFound } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { getClientTeamForActor } from "@/lib/team/clients";
import { HubTeamPanel } from "@/components/hub/HubTeamPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Team" };

// The Team tab: both sides of the account, the Edge8 staff assigned to this
// client and the client's own contacts.
export default async function TeamClientTeamTab({ params }: { params: { companyId: string } }) {
  const actor = await requireTeamMember();
  const team = await getClientTeamForActor(actor, params.companyId);
  if (team === null) notFound();

  return <HubTeamPanel team={team} />;
}
