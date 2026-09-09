import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { MetricCard } from "@/kernel/ui/MetricCard";
import type { ProgramStatus, ProgramSummary } from "@/entities/team/modules/hub/program";
import { formatLeverage, type TokenUsage } from "@/entities/portal";

// The hub home's top band, shared by the admin company 360 (Client Hub view),
// the team client hub Overview and the client portal hub: the company-grain
// Human Tokens strip, then the AI Programs card grid. Read-only; each card
// links into the surface's own program view via programHref. Markup mirrors
// the admin hub home verbatim so all three render identically.
//
// Cards take HubProgramCard rather than ProgramSummary so the portal can feed
// the same band without the repo name ever reaching a client page: repoLabel is
// whatever line the surface wants under the program name, and hasRepo only
// says whether delivery figures exist.

export type HubProgramCard = Pick<
  ProgramSummary,
  "id" | "name" | "status" | "deliveredHours" | "prsMergedLast7d" | "roadmapDone" | "roadmapTotal" | "boardCount"
> & {
  repoLabel: string | null; // null renders "No repo connected"
  hasRepo: boolean;
};

// The Edge8-side mapping: the card shows the GitHub repo itself.
export function hubProgramCard(p: ProgramSummary): HubProgramCard {
  return { ...p, repoLabel: p.githubRepo, hasRepo: !!p.repoId };
}

const PROGRAM_STATUS_TONE: Record<ProgramStatus, BadgeTone> = {
  draft: "neutral",
  active: "ok",
  complete: "info",
  archived: "neutral",
};

function fmtHours(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// The Human Tokens strip on its own, for the portal home which lays out its
// program cards differently but must show the same five figures.
// boughtSub replaces the Bought tile's note; the admin passes the latest
// allocation's kind and reason so the figure explains itself.
export function HubTokensStrip({ usage, boughtSub }: { usage: TokenUsage; boughtSub?: ReactNode }) {
  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Human Tokens</h2>
        <span className="admin-cell-muted u-sm">Company credit pool, shared by all AI Programs</span>
      </div>
      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Bought" value={usage.boughtTokens.toLocaleString()} sub={boughtSub ?? "Purchased + allocated tokens"} />
        <MetricCard label="Delivered" value={fmtHours(usage.deliveredHours)} sub="Human Tokens Tracked" />
        <MetricCard label="Balance" value={fmtHours(usage.balanceTokens)} sub="Bought minus delivered" />
        <MetricCard label="Planned" value={usage.plannedTokens.toLocaleString()} sub="Roadmap high estimates" />
        <MetricCard
          label="AI leverage"
          value={formatLeverage(usage.leverage)}
          sub="AI value delivered per human hour"
        />
      </div>
    </>
  );
}

export function HubProgramsBand({
  usage,
  programs,
  programHref,
  boughtSub,
}: {
  usage: TokenUsage;
  programs: HubProgramCard[];
  programHref: (programId: string) => string;
  boughtSub?: ReactNode;
}) {
  return (
    <>
      <HubTokensStrip usage={usage} boughtSub={boughtSub} />

      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">AI Programs</h2>
      </div>
      {programs.length === 0 ? (
        <div className="admin-card admin-section-card u-mb-5">
          <div className="admin-empty">No AI Programs yet. Created from the client portal or by Arca Wellness.</div>
        </div>
      ) : (
        <div className="admin-kpi-grid admin-hub-programs-grid">
          {programs.map((p) => {
            const pct = p.roadmapTotal > 0 ? Math.round((p.roadmapDone / p.roadmapTotal) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={programHref(p.id)}
                className="admin-card admin-section-card admin-hub-program-card"
              >
                <div className="admin-hub-program-head">
                  <span className="admin-cell-strong u-lg">{p.name}</span>
                  <Badge tone={PROGRAM_STATUS_TONE[p.status]}>{p.status}</Badge>
                </div>
                <div className="admin-cell-muted admin-cell-mono u-mt-1 u-sm u-break-all">
                  {p.repoLabel ?? "No repo connected"}
                </div>
                <div className="u-mt-4">
                  <div className="admin-cell-muted admin-hub-program-progressrow">
                    <span>
                      {p.roadmapTotal === 0
                        ? "No roadmap items yet"
                        : `Roadmap ${p.roadmapDone}/${p.roadmapTotal} done`}
                    </span>
                    {p.roadmapTotal > 0 && <span>{pct}%</span>}
                  </div>
                  <div className="admin-board-progress">
                    <div className="admin-board-progress-fill" style={{ width: `${pct}%` }} /* layout-ok: data-driven progress width */ />
                  </div>
                </div>
                <div className="admin-cell-muted u-mt-3 u-sm">
                  {p.hasRepo
                    ? `${fmtHours(p.deliveredHours)} Human Tokens Tracked · ${p.prsMergedLast7d} PR${p.prsMergedLast7d === 1 ? "" : "s"} merged 7d · `
                    : ""}
                  {p.boardCount} {p.boardCount === 1 ? "board" : "boards"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
