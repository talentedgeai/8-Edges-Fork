import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany360, getCompanyReferredBy } from "@/lib/admin/companies";
import { getPortalMembershipsForCompany } from "@/lib/admin/portal";
import {
  getAssignmentsForCompany,
  listActiveTeamMembers,
  listClientContacts,
} from "@/lib/admin/staff-assignments";
import { getInvoicesForCompany } from "@/lib/admin/invoices";
import { getMeetingsForCompany } from "@/lib/admin/meetings";
import { getSurveyResponsesForCompany } from "@/lib/admin/surveys";
import { getBoardBySlug, listBoardManageOptions } from "@/lib/boards/data";
import { listDocumentsForCompanies } from "@/lib/client-documents";
import { getCompanyHubTeam, getLiveCardItemIds } from "@/lib/admin/company-hub";
import {
  fetchAll,
  listProgramSummaries,
  PROGRAM_SELECT,
  type ProgramSummary,
  type ProgramSummaryInputs,
} from "@/lib/hub/program";
import {
  computeTokenUsage,
  fetchDeliveryRaw,
  getAllocatedTokensForCompanies,
  getTokenBalanceForCompanies,
  type TokenUsage,
} from "@/lib/hub/tokens";
import { BACKLOG_SELECT, ROADMAP_GROUPS_SELECT, type BacklogItem, type RoadmapGroup } from "@/lib/client-backlog";
import { getAdminUser } from "@/lib/admin-auth";
import { PageHead } from "@/components/admin/PageHead";
import { Badge } from "@/components/admin/Badge";
import { Tabs, type TabDef } from "@/components/admin/Tabs";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import { PortalMemberControls } from "@/components/admin/PortalMemberControls";
import { CrmCommandBar } from "@/components/admin/CrmCommandBar";
import { AssignedStaffCard } from "@/components/admin/AssignedStaffCard";
import { CompanyDocuments, type ProgramOption } from "@/components/admin/CompanyDocuments";
import { MeetingsPanel } from "@/components/hub/MeetingsPanel";
import { InvoicesPanel } from "@/components/hub/InvoicesPanel";
import { HubTeamPanel } from "@/components/hub/HubTeamPanel";
import { HubProgramsBand } from "@/components/hub/HubProgramsBand";
import { BoardView } from "@/app/admin/(dashboard)/boards/[slug]/BoardView";
import { BacklogAdminEditor } from "@/app/admin/(dashboard)/edges/client-roadmaps/BacklogAdminEditor";
import { OverviewEditor } from "@/app/admin/(dashboard)/edges/client-roadmaps/OverviewEditor";
import { setMeetingPublished, setMeetingProgram } from "@/app/admin/(dashboard)/revenue/meetings/actions";
import { companyOs } from "@/lib/supabase";
import { firstParam, mergeQuery, type SearchParamsObj } from "@/lib/admin/url";
import { CompanyDetailsCard } from "../CompanyDetailsCard";
import { CompanyDangerZone } from "../CompanyDangerZone";

export const dynamic = "force-dynamic";

const CLIENT_STAGES = new Set(["customer", "evangelist"]);

function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParamsObj;
}) {
  const data = await getCompany360(params.id);
  if (!data) notFound();

  const { company, deals, people, affiliate: companyAffiliate } = data;
  const name = company.name || "(no name)";
  const isClient = CLIENT_STAGES.has((company.lifecycle_stage || "").toLowerCase());

  const viewParam = firstParam(searchParams.view);
  const view = viewParam === "hub" ? "hub" : viewParam === "internal" ? "internal" : isClient ? "hub" : "internal";

  // Context-aware back-link: reflect where the user came from (Client Hubs,
  // Clients, or the Companies list) rather than always "Companies".
  const from = firstParam(searchParams.from);
  const back =
    from === "client-hubs"
      ? { href: "/admin/client-hubs", label: "← Client Hubs" }
      : from === "clients"
        ? { href: "/admin/revenue/clients", label: "← Clients" }
        : { href: "/admin/revenue/companies", label: "← Companies" };

  const dealValueCents = deals.reduce((s, d) => s + (d.amount_usd_cents ?? d.amount_cents ?? 0), 0);
  const affiliateContacts = people.filter((p) => p.affiliateActive);
  const showAffiliateCard = !!companyAffiliate?.active || affiliateContacts.length > 0;

  // ── Internal tabs ────────────────────────────────────────────────
  async function internalTabs(): Promise<TabDef[]> {
    const [portalMemberships, assignments, assignableTeamMembers, clientContacts, referredBy, surveys] =
      await Promise.all([
      getPortalMembershipsForCompany(company.id),
      getAssignmentsForCompany(company.id),
      listActiveTeamMembers(),
      listClientContacts(company.id),
      getCompanyReferredBy(company.id),
      getSurveyResponsesForCompany(company.id),
    ]);
    const activeMemberCount = [...portalMemberships.values()].filter((m) => m.status === "active").length;

    return [
      {
        key: "details",
        label: "Details",
        content: (
          <div className="u-stack u-gap-4">
            <CompanyDetailsCard
              company={{
                id: company.id,
                name: company.name,
                website_url: company.website_url,
                industry_normalized: company.industry_normalized,
                size_band: company.size_band,
                country: company.country,
                priority: company.priority,
                notes: company.notes,
                created_at: company.created_at,
              }}
              referredBy={referredBy}
            />
            {showAffiliateCard && (
              <div className="admin-card admin-section-card">
                <h2 className="admin-card-title">Referral &amp; affiliates</h2>
                <div className="u-stack u-gap-4">
                  {companyAffiliate?.active && (
                    <div>
                      <div className="admin-cell-muted u-mb-1 u-sm">This company is an affiliate</div>
                      <div className="u-row u-wrap">
                        {companyAffiliate.code && <Badge tone="ok">{companyAffiliate.code}</Badge>}
                        <span className="admin-cell-strong">{formatCents(companyAffiliate.realizedCents, "usd")} earned</span>
                        {companyAffiliate.unpaidCents > 0 && (
                          <span className="admin-cell-muted">· {formatCents(companyAffiliate.unpaidCents, "usd")} unpaid</span>
                        )}
                      </div>
                    </div>
                  )}
                  {affiliateContacts.length > 0 && (
                    <div>
                      <div className="admin-cell-muted u-mb-1 u-sm">Affiliate contacts</div>
                      <div className="u-row u-wrap">
                        {affiliateContacts.map((p) => (
                          <Link key={p.id} href={`/admin/contacts/${p.id}`} className="u-row">
                            {p.full_name || p.email}
                            {p.affiliateCode && <Badge tone="ok">{p.affiliateCode}</Badge>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="admin-card admin-section-card">
              <CompanyDangerZone companyId={company.id} companyName={name} />
            </div>
          </div>
        ),
      },
      {
        key: "people",
        label: "People & access",
        count: activeMemberCount,
        content:
          people.length === 0 ? (
            <Empty text="No linked people yet. Link a contact from the CRM to invite them to the portal." />
          ) : (
            <div className="admin-list">
              {people.map((p) => {
                const membership = portalMemberships.get(p.id);
                return (
                  <div className="admin-list-row" key={p.id}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">
                        <Link href={`/admin/contacts/${p.id}`}>{p.full_name || p.email}</Link>
                      </div>
                      <div className="admin-list-sub">{p.email}</div>
                    </div>
                    <div className="admin-list-aside">
                      <PortalMemberControls
                        personId={p.id}
                        companyId={company.id}
                        active={membership?.status === "active"}
                        role={membership?.role}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ),
      },
      {
        key: "staffing",
        label: "Staffing",
        count: assignments.length,
        content: (
          <AssignedStaffCard
            companyId={company.id}
            assignments={assignments}
            teamMembers={assignableTeamMembers}
            clientContacts={clientContacts}
          />
        ),
      },
      {
        key: "surveys",
        label: "Surveys",
        count: surveys.length,
        content:
          surveys.length === 0 ? (
            <Empty text="No survey responses from this company's people yet." />
          ) : (
            <div className="admin-list">
              {surveys.map((s) => (
                <div className="admin-list-row" key={s.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">{s.surveyName}</div>
                    <div className="admin-list-sub">{s.respondentName}</div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone="neutral">{formatDate(s.submittedAt)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ),
      },
    ];
  }

  // ── Client Hub tabs + top band data ──────────────────────────────
  // The hub home is organized by AI Program: a company-grain Human Tokens
  // strip, the program card grid, then the company-wide tabs. When programs
  // exist, the Work Board / Roadmap / Documents / Meetings tabs show ONLY
  // untagged (ai_program_id null) rows, so nothing is presented twice; tagged
  // rows live in their program view. When no programs exist, the tabs behave
  // exactly as before.
  async function hubData(): Promise<{ tabs: TabDef[]; programs: ProgramSummary[]; usage: TokenUsage }> {
    // Wave 1: every query here depends only on the company id, and every
    // dataset is fetched exactly once. The program summaries and the token
    // usage are DERIVED from these rows below rather than re-fetching them.
    const [
      { data: programData },
      delivery,
      boardRowsRes,
      balance,
      allocatedTokens,
      boardOptions,
      admin,
      itemRows,
      groupRows,
      overviewRow,
      meetings,
      invoices,
      team,
      documents,
    ] = await Promise.all([
      companyOs.from("ai_programs").select(PROGRAM_SELECT).eq("company_id", company.id).neq("status", "archived").order("created_at", { ascending: false }),
      fetchDeliveryRaw([company.id]),
      companyOs
        .from("boards")
        .select("id, slug, ai_program_id")
        .eq("client_company_id", company.id)
        .eq("status", "active")
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      getTokenBalanceForCompanies([company.id]),
      getAllocatedTokensForCompanies([company.id]),
      listBoardManageOptions(),
      getAdminUser(),
      // Paginated: backlog items routinely outgrow PostgREST's 1000-row cap,
      // and a truncated read would undercount plannedTokens and could wrongly
      // drop the company-wide tabs. Trailing .order("id") keeps pages stable.
      fetchAll<BacklogItem>(() =>
        companyOs
          .from("client_backlog_items")
          .select(BACKLOG_SELECT)
          .eq("company_id", company.id)
          .is("archived_at", null)
          .order("sort_order", { ascending: true })
          .order("id"),
      ),
      companyOs.from("client_roadmap_groups").select(ROADMAP_GROUPS_SELECT).eq("company_id", company.id).is("archived_at", null).order("sort_order", { ascending: true }),
      companyOs.from("client_roadmap_overview").select("body").eq("company_id", company.id).maybeSingle(),
      getMeetingsForCompany(company.id),
      getInvoicesForCompany(company.id),
      getCompanyHubTeam(company.id),
      listDocumentsForCompanies([company.id]),
    ]);

    const programRowsFull = (programData ?? []) as ProgramSummaryInputs["programs"];
    const hasPrograms = programRowsFull.length > 0;
    const hubBoards = (boardRowsRes.data ?? []) as Array<{ id: string; slug: string; ai_program_id: string | null }>;
    const untaggedBoards = hubBoards.filter((b) => !b.ai_program_id);
    // First active board (same "first active" convention as before); with
    // programs present, first active UNTAGGED board (program boards render in
    // their program view instead).
    const boardSlug = (hasPrograms ? untaggedBoards[0] : hubBoards[0])?.slug ?? null;

    const allItems = itemRows;
    const allGroups = (groupRows.data ?? []) as unknown as RoadmapGroup[];
    // Company-wide slices: untagged rows only once programs exist.
    const roadmapItems = hasPrograms ? allItems.filter((i) => !i.ai_program_id) : allItems;
    const usedKeys = new Set(roadmapItems.map((i) => i.group_key));
    const roadmapGroups = hasPrograms
      ? allGroups.filter((g) => g.ai_program_id === null || usedKeys.has(g.key))
      : allGroups;
    const hubMeetings = hasPrograms ? meetings.filter((m) => !m.aiProgramId) : meetings;
    const hubDocuments = hasPrograms ? documents.filter((d) => !d.programId) : documents;
    // Both tabs drop together only when at least one row is program-tagged AND
    // nothing company-wide remains (zero data loss of access; each tagged row
    // is reachable in its program view). The tagged-row guard keeps a company
    // with programs but no boards/items from vacuously losing the tabs, which
    // hold the OverviewEditor and the place to start a company-wide roadmap.
    const taggedBoardCount = hubBoards.length - untaggedBoards.length;
    const taggedItemCount = allItems.length - roadmapItems.length;
    const dropCompanyWideTabs =
      hasPrograms &&
      taggedBoardCount + taggedItemCount > 0 &&
      untaggedBoards.length === 0 &&
      roadmapItems.length === 0;
    const overviewBody = (overviewRow.data as { body: string } | null)?.body ?? "";

    // Wave 2: the only fetches that depend on wave 1 (board slug, repo ids,
    // the admin's email, the filtered item ids).
    const [programSummaries, boardDetail, liveCardItemIds, viewerRow] = await Promise.all([
      listProgramSummaries(company.id, {
        programs: programRowsFull,
        delivery,
        backlogRows: allItems,
        boardRows: hubBoards,
      }),
      boardSlug ? getBoardBySlug(boardSlug) : Promise.resolve(null),
      getLiveCardItemIds(roadmapItems.map((i) => i.id)),
      // The admin's own person row, so cards freshly assigned to them wear "New".
      admin
        ? companyOs.from("people").select("id").eq("email", admin.email).is("archived_at", null).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const viewerPersonId = (viewerRow.data as { id: string } | null)?.id ?? null;

    const plannedTokens = allItems.reduce((sum, i) => sum + Number(i.token_high ?? 0), 0);
    const usage = computeTokenUsage({ balance, allocatedTokens, plannedTokens, delivery });

    const programOptions: ProgramOption[] = programRowsFull.map((p) => ({ id: p.id, name: p.name }));
    const hubInvoices = invoices.map((r) => ({
      id: r.id,
      docNumber: r.doc_number,
      txnDate: r.txn_date,
      dueDate: r.due_date,
      currency: r.currency,
      amountCents: r.amount_cents,
      balanceCents: r.balance_cents,
      status: r.status,
    }));

    const companyWideTabs: TabDef[] = dropCompanyWideTabs
      ? []
      : [
          {
            key: "board",
            label: hasPrograms ? "Work Board (company-wide)" : "Work Board",
            content: boardDetail ? (
              <BoardView detail={boardDetail} canManage teamOptions={boardOptions.team} clientOptions={boardOptions.clients} programOptions={boardOptions.programs} viewerPersonId={viewerPersonId} />
            ) : (
              <section className="admin-card admin-section-card">
                <Empty
                  text={
                    hasPrograms
                      ? "No company-wide work board. Program boards live in their AI Program view."
                      : "This client has no active work board yet. Create one from Work Boards."
                  }
                />
              </section>
            ),
          },
          {
            key: "roadmap",
            label: hasPrograms ? "Roadmap (company-wide)" : "Roadmap",
            count: roadmapItems.length,
            content: (
              <>
                <OverviewEditor companyId={company.id} initialBody={overviewBody} />
                <BacklogAdminEditor
                  companyId={company.id}
                  groups={roadmapGroups}
                  items={roadmapItems}
                  programs={hasPrograms ? programOptions : undefined}
                  showArchived={false}
                  liveCardItemIds={liveCardItemIds}
                />
              </>
            ),
          },
        ];

    const tabs: TabDef[] = [
      ...companyWideTabs,
      {
        key: "documents",
        label: "Documents",
        count: hubDocuments.length,
        content: (
          <section className="admin-card admin-section-card">
            <CompanyDocuments companyId={company.id} documents={hubDocuments} programs={programOptions} />
          </section>
        ),
      },
      {
        key: "meetings",
        label: "Meetings",
        count: hubMeetings.length,
        content: (
          <section className="admin-card admin-section-card">
            <MeetingsPanel meetings={hubMeetings} publishAction={setMeetingPublished} programAction={setMeetingProgram} programOptions={programOptions} />
          </section>
        ),
      },
      {
        key: "invoices",
        label: "Invoices",
        count: hubInvoices.length,
        content: (
          <section className="admin-card admin-section-card">
            <InvoicesPanel invoices={hubInvoices} />
          </section>
        ),
      },
      { key: "team", label: "Team", content: <HubTeamPanel team={team} /> },
    ];

    return { tabs, programs: programSummaries, usage };
  }

  const hub = view === "hub" ? await hubData() : null;
  const tabs = hub ? hub.tabs : await internalTabs();

  return (
    <div>
      <PageHead
        eyebrow={<Link href={back.href}>{back.label}</Link>}
        title={name}
        sub={company.website_url || undefined}
        action={
          <div className="u-stack u-items-end">
            <span className="u-row u-wrap">
              {company.archived_at && <Badge tone="neutral">Archived</Badge>}
              {isClient ? <Badge tone="ok">Client</Badge> : company.lifecycle_stage && <Badge tone="neutral">{humanize(company.lifecycle_stage)}</Badge>}
              {company.priority && <Badge>{humanize(company.priority)}</Badge>}
            </span>
            <CrmCommandBar
              kind="company"
              id={company.id}
              name={name}
              archived={!!company.archived_at}
              assumeCompanyId={company.id}
              affiliate={{ active: !!companyAffiliate?.active, code: companyAffiliate?.code ?? null }}
            />
          </div>
        }
      />

      <div className="admin-card-head">
        {isClient ? (
          <div className="admin-viewtoggle">
            <Link href={`/admin/revenue/companies/${company.id}${mergeQuery(searchParams, { view: "internal" })}`} className={view === "internal" ? "is-active" : ""}>
              Internal
            </Link>
            <Link href={`/admin/revenue/companies/${company.id}${mergeQuery(searchParams, { view: "hub" })}`} className={view === "hub" ? "is-active" : ""}>
              Client Hub
            </Link>
          </div>
        ) : (
          <span className="admin-cell-muted u-sm">Internal record</span>
        )}
        <span className="admin-cell-muted u-sm">
          {deals.length} {deals.length === 1 ? "deal" : "deals"}
          {dealValueCents ? ` · ${formatCents(dealValueCents, "usd")} total` : ""} ·{" "}
          <Link href={`/admin/revenue/deals?company=${company.id}`}>Open in CRM →</Link>
        </span>
      </div>

      {hub && (
        <HubProgramsBand
          usage={hub.usage}
          programs={hub.programs}
          programHref={(programId) => `/admin/revenue/companies/${company.id}/programs/${programId}`}
        />
      )}

      <div className="admin-card admin-section-card">
        <Tabs tabs={tabs} />
      </div>
    </div>
  );
}
