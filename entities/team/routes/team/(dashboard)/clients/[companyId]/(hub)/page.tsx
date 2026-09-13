import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  getHubOverviewForActor,
  getClientRoadmapForActor,
  getHubWorkboardForActor,
  getClientDocumentsForActor,
  getClientMeetingsForActor,
  getClientTeamForActor,
  getClientInvoicesForActor,
  getActorEmail,
  companyHasPrograms,
} from "@/entities/team/lib/hub-clients";
import { getClientProposalsForActor } from "@/entities/team/lib/hub-client-proposals";
import { HubTokensStrip } from "@/entities/team/ui/HubProgramsBand";
import { ProgramDeliveryCard } from "@/entities/team/ui/ProgramDeliveryCard";
import { MeetingsPanel } from "@/entities/crm";
import { ClientDocumentsList } from "./ClientDocumentsList";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate, initials } from "@/kernel/ui/format";

export const metadata = { title: "Client Overview" };

// The hub Overview is the client's own delivery page, rendered for the assigned
// Edge8 team member: the same wireframe as the portal home (the Human Tokens
// strip, the AI Programs as wide delivery cards, the shared documents and
// meetings, and a rail of what needs the client, the proposals, and the people
// on the account). The team view differs from the client's in four ways: it
// only shows invoices to an admin team member, it never offers to buy tokens,
// it lists the client's own contacts beside the Edge8 team, and every delivered
// figure is branded "Human Tokens Tracked". The company-wide board, roadmap,
// documents, meetings, invoices and team surfaces stay on their own tabs below.

const WEEK_DAYS = 7;

export default async function TeamClientHubOverview({ params }: { params: { companyId: string } }) {
  const actor = await requireTeamMember();
  const companyId = params.companyId;
  const since = new Date(Date.now() - WEEK_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [overview, roadmap, board, documents, meetings, proposals, teamRoster, invoices, actorEmail, hasPrograms] =
    await Promise.all([
      getHubOverviewForActor(actor, companyId),
      getClientRoadmapForActor(actor, companyId),
      getHubWorkboardForActor(actor, companyId),
      getClientDocumentsForActor(actor, companyId),
      getClientMeetingsForActor(actor, companyId),
      getClientProposalsForActor(actor, companyId),
      getClientTeamForActor(actor, companyId),
      actor.isAdmin ? getClientInvoicesForActor(actor, companyId) : Promise.resolve(null),
      getActorEmail(actor),
      companyHasPrograms(companyId),
    ]);
  if (!overview) notFound();

  const { usage, programs } = overview;
  const items = roadmap?.items ?? [];

  // ── Per program: Now items and cards moved to Done this week ────────────
  const programOfBoard = new Map((board?.boards ?? []).map((b) => [b.id, b.ai_program_id]));
  const nowItems = (programId: string) =>
    items.filter(
      (i) => i.ai_program_id === programId && i.status !== "shipped" && (i.client_priority ?? i.edge8_priority) === "now",
    );
  const shippedCards = (programId: string) =>
    (board?.cards ?? [])
      .filter((c) => c.status === "done" && (c.completed_at ?? "") >= since && c.board_id && programOfBoard.get(c.board_id) === programId)
      .sort((a, b) => ((a.completed_at ?? "") < (b.completed_at ?? "") ? 1 : -1));

  // ── Needs you: outstanding invoices (admin only) and cards waiting on the
  // client. Leave and request queues are per portal member, not a company view.
  const openInvoices = invoices?.filter((inv) => inv.balanceCents > 0) ?? [];
  const waitingLane = board?.lanes.find((l) => l.name.toLowerCase().includes("wait"));
  const waitingCards = waitingLane && board ? board.cards.filter((c) => c.laneId === waitingLane.id && !c.archived_at) : [];
  const needsCount = openInvoices.length + waitingCards.length;

  // ── Shared (company-wide) documents, and every meeting ──────────────────
  const sharedDocs = hasPrograms ? (documents ?? []).filter((d) => !d.programId) : documents ?? [];
  const sharedMeetings = meetings ?? [];

  const edge8 = teamRoster?.edge8 ?? [];
  const clientContacts = teamRoster?.client ?? [];

  return (
    <div className="u-grid-2-1">
      <div>
        <HubTokensStrip usage={usage} />

        <div className="admin-hub-band-head">
          <h2 className="admin-card-title">AI Programs</h2>
        </div>
        {programs.length === 0 ? (
          <div className="admin-card admin-section-card u-mb-4">
            <div className="admin-empty">No AI Programs yet. Created from the client portal or by Edge8.</div>
          </div>
        ) : (
          programs.map((p) => {
            const href = `/team/clients/${companyId}/programs/${p.id}`;
            return (
              <ProgramDeliveryCard
                key={p.id}
                name={p.name}
                status={p.status}
                roadmapDone={p.roadmapDone}
                roadmapTotal={p.roadmapTotal}
                hasRepo={!!p.repoId}
                deliveredHours={p.deliveredHours}
                prsMergedLast7d={p.prsMergedLast7d}
                now={nowItems(p.id).map((i) => ({ id: i.id, title: i.title }))}
                shipped={shippedCards(p.id).map((c) => ({ id: c.id, title: c.title, completedAt: c.completed_at }))}
                href={href}
                roadmapHref={`${href}?tab=roadmap`}
                boardHref={`${href}?tab=boards`}
              />
            );
          })
        )}

        {(sharedDocs.length > 0 || sharedMeetings.length > 0) && (
          <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Documents and meetings</h2>
              {hasPrograms && <span className="admin-cell-muted u-sm">company-wide documents, every meeting</span>}
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              {sharedDocs.length > 0 && (
                <ClientDocumentsList documents={sharedDocs} companyId={companyId} actorEmail={actorEmail} />
              )}
              {sharedMeetings.length > 0 && (
                <div className={sharedDocs.length > 0 ? "u-mt-4" : ""}>
                  <MeetingsPanel meetings={sharedMeetings} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        {needsCount > 0 && (
          <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Needs the client</h2>
            </div>
            <div className="admin-card admin-section-card admin-card--attention u-mb-4">
              <div className="admin-list">
                {openInvoices.map((inv) => {
                  const overdue = !!inv.dueDate && inv.dueDate.slice(0, 10) < today;
                  return (
                    <Link className="admin-list-row u-link-plain" key={inv.id} href={`/team/clients/${companyId}/invoices`}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">Invoice {inv.docNumber || inv.id.slice(0, 8)}</div>
                        <div className="admin-list-sub">
                          {formatCents(inv.balanceCents, inv.currency)}{" "}
                          {overdue ? `overdue since ${formatDate(inv.dueDate)}` : inv.dueDate ? `due ${formatDate(inv.dueDate)}` : "outstanding"}
                        </div>
                      </div>
                      <div className="admin-list-aside"><Badge tone="warn">View</Badge></div>
                    </Link>
                  );
                })}
                {waitingCards.map((c) => {
                  const pid = c.board_id ? programOfBoard.get(c.board_id) : null;
                  return (
                    <Link
                      className="admin-list-row u-link-plain"
                      key={c.id}
                      href={pid ? `/team/clients/${companyId}/programs/${pid}?tab=boards` : `/team/clients/${companyId}/board`}
                    >
                      <div className="admin-list-main">
                        <div className="admin-list-title">{c.title}</div>
                        <div className="admin-list-sub">Waiting on the client</div>
                      </div>
                      <div className="admin-list-aside"><Badge tone="warn">Answer</Badge></div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {proposals && proposals.length > 0 && (
          <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Proposals</h2>
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              <div className="admin-list">
                {proposals.map((d) => (
                  <div className="admin-list-row" key={d.id}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">{d.title || "Proposal"}</div>
                      <div className="admin-list-sub">{formatDate(d.createdAt)}</div>
                    </div>
                    <div className="admin-list-aside">
                      <a className="admin-btn admin-btn--sm" href={d.proposalUrl} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {(edge8.length > 0 || clientContacts.length > 0) && (
          <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Team</h2>
              <Link href={`/team/clients/${companyId}/team`} className="admin-cell-muted u-sm">All →</Link>
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              {edge8.length > 0 && (
                <>
                  <div className="admin-eyebrow u-mb-1">Edge8 team</div>
                  <div className="admin-list">
                    {edge8.map((m) => (
                      <div className="admin-list-row" key={`e8-${m.name}`}>
                        <div className="admin-list-main u-row u-gap-3">
                          <div className="admin-avatar admin-avatar--soft">{initials(m.name)}</div>
                          <div>
                            <div className="admin-list-title">{m.name}</div>
                            <div className="admin-list-sub">{m.roleTitle || "Edge8 team"}</div>
                            {m.email && <a href={`mailto:${m.email}`} className="admin-list-sub u-link-plain">{m.email}</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {clientContacts.length > 0 && (
                <div className={edge8.length > 0 ? "u-mt-4" : ""}>
                  <div className="admin-eyebrow u-mb-1">Client contacts</div>
                  <div className="admin-list">
                    {clientContacts.map((m) => (
                      <div className="admin-list-row" key={`c-${m.name}`}>
                        <div className="admin-list-main u-row u-gap-3">
                          <div className="admin-avatar admin-avatar--soft">{initials(m.name)}</div>
                          <div>
                            <div className="admin-list-title">{m.name}</div>
                            {m.title && <div className="admin-list-sub">{m.title}</div>}
                            {m.email && <a href={`mailto:${m.email}`} className="admin-list-sub u-link-plain">{m.email}</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
