// The company hub's Human Tokens band.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real component — today
// entities/company-os/routes/(dashboard)/revenue/companies/[id]/AdminHubTokensBand.tsx.
//
// Fork note: the band shows Bought / Delivered / Balance against tracker
// measurements and carries the controls for granting tokens and adding
// delivered hours by hand. Both the tracker and the commercial model behind it
// are upstream's. The company hub page ships, so the component has to exist; it
// renders nothing.
//
// The prop types are upstream's, copied. Loosening them would be the quiet kind
// of wrong: `programHref` is called with an inferred argument at the call site,
// so a `Record<string, unknown>` here turns that into an implicit `any` and the
// fork's own typecheck fails somewhere unrelated.
import type { HubProgramCard } from "@/entities/team";
import type { TokenUsage } from "@/entities/portal";

export async function AdminHubTokensBand(_props: {
  companyId: string;
  usage: TokenUsage;
  programs: HubProgramCard[];
  programHref: (programId: string) => string;
}) {
  return null;
}
