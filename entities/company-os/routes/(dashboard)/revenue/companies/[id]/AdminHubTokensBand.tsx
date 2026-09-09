import { HubProgramsBand, type HubProgramCard } from "@/entities/team";
import type { TokenUsage } from "@/entities/portal";
import { listTokenAllocations, TOKEN_ALLOCATION_KIND_LABELS, type TokenAllocation } from "@/entities/htt";
import { formatDate } from "@/kernel/ui/format";
import { SetBoughtTokens } from "@/entities/company-os/modules/crm/ui/SetBoughtTokens";

// The admin's version of the hub top band: the shared Human Tokens strip and
// program grid, with the Bought tile explaining itself from the latest
// allocation and the Set bought control underneath. The team and portal hubs
// render HubProgramsBand alone; only the admin can move Bought. Lives beside
// the page (route code, outside the door graph) because it composes the team
// and portal doors, which sit above company-os in the layer order.

// The note under the Bought tile: the latest allocation's kind and reason, so
// the figure explains itself; the default wording when nothing was recorded.
function boughtNote(latest: TokenAllocation | undefined): string | undefined {
  if (!latest || (!latest.kind && !latest.reason)) return undefined;
  const who = latest.setByEmail.split("@")[0];
  const kind = latest.kind ? TOKEN_ALLOCATION_KIND_LABELS[latest.kind] : null;
  return [`Set ${formatDate(latest.setAt)} by ${who}`, kind, latest.reason].filter(Boolean).join(" · ");
}

export async function AdminHubTokensBand({
  companyId,
  usage,
  programs,
  programHref,
}: {
  companyId: string;
  usage: TokenUsage;
  programs: HubProgramCard[];
  programHref: (programId: string) => string;
}) {
  const allocations = await listTokenAllocations(companyId);
  return (
    <>
      <HubProgramsBand usage={usage} programs={programs} programHref={programHref} boughtSub={boughtNote(allocations[0])} />
      <SetBoughtTokens companyId={companyId} current={usage.boughtTokens} history={allocations} />
    </>
  );
}
