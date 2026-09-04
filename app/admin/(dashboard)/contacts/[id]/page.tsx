import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson360 } from "@/lib/admin/contacts";
import { getAffiliate360 } from "@/lib/admin/affiliates";
import { getPortalMembershipsForPerson } from "@/lib/admin/portal";
import { PortalMemberControls } from "@/components/admin/PortalMemberControls";
import { ContactAffiliatePanel } from "./ContactAffiliatePanel";
import { PageHead } from "@/components/admin/PageHead";
import { Badge, statusTone } from "@/components/admin/Badge";
import { Tabs, type TabDef } from "@/components/admin/Tabs";
import { PersonEditForm } from "./PersonEditForm";
import { PersonDangerZone } from "./PersonDangerZone";
import { PromoteButton } from "./PromoteButton";
import { CrmCommandBar } from "@/components/admin/CrmCommandBar";
import { ApplicantStatusSelect } from "@/components/admin/ApplicantStatusSelect";
import { formatCents, formatDate, humanize, timeAgo } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact",
  description: "Full relationship history and activity for one contact.",
};

function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  // All three loaders key only on the person id, so run them in one parallel
  // wave instead of awaiting the 360 first and the portal/affiliate reads after.
  const [data, portalMemberships, affiliate] = await Promise.all([
    getPerson360(params.id),
    getPortalMembershipsForPerson(params.id),
    getAffiliate360({ personId: params.id }),
  ]);
  if (!data) notFound();

  const { person, lead, candidateProfile, inquiries, deals, orders, bookings, applications, documents, surveyResponses, interactions, meetings, transitions, companies } = data;
  const isAffiliate = !!affiliate && affiliate.codes.length > 0;
  const membershipByCompany = new Map(
    portalMemberships.filter((m) => m.company_id).map((m) => [m.company_id as string, m]),
  );
  const isCustomer = deals.some((d) => d.status === "won");
  // Applicants are recruited, not sold to: for a job seeker we replace the
  // "Promote to lead" sales action with a status control on their most recent
  // application (applications come back newest-first from getPerson360).
  const isApplicant = person.persona === "job_seeker";
  const latestApplication = applications[0] ?? null;
  const primaryCompany = companies.find((c) => c.is_primary) ?? companies[0] ?? null;
  const name = person.full_name || person.preferred_name || person.email;
  const location = [person.city, person.state_province, person.country].filter(Boolean).join(", ");

  // One merged activity stream: interactions, meetings, and lifecycle
  // transitions, newest first. This is the relationship history in one place.
  type ActivityItem = { key: string; at: string; title: string; sub: string; badge?: string };
  const activity: ActivityItem[] = [
    ...interactions.map((i) => ({
      key: `i-${i.id}`,
      at: i.occurred_at ?? i.created_at,
      title: i.subject || humanize(i.kind) || "Interaction",
      sub: i.body ? (i.body.length > 140 ? `${i.body.slice(0, 140)}…` : i.body) : humanize(i.kind),
      badge: humanize(i.kind ?? "note"),
    })),
    ...meetings.map((m) => ({
      key: `m-${m.id}`,
      at: m.started_at ?? "",
      title: m.title || "Meeting",
      sub: [humanize(m.meeting_type), m.source ? `via ${m.source}` : null].filter(Boolean).join(" · "),
      badge: "Meeting",
    })),
    ...transitions.map((t) => ({
      key: `t-${t.id}`,
      at: t.occurred_at,
      title: `Lifecycle: ${humanize(t.from_stage ?? "—")} → ${humanize(t.to_stage ?? "—")}`,
      sub: [
        t.from_status || t.to_status
          ? `${humanize(t.from_status ?? "—")} → ${humanize(t.to_status ?? "—")}`
          : null,
        t.reason ? humanize(t.reason) : null,
        t.note,
      ]
        .filter(Boolean)
        .join(" · "),
      badge: "Stage change",
    })),
  ]
    .filter((a) => a.at)
    .sort((a, b) => b.at.localeCompare(a.at));

  const tabs: TabDef[] = [
    {
      key: "activity",
      label: "Activity",
      count: activity.length,
      content: activity.length === 0 ? (
        <Empty text="No activity yet." />
      ) : (
        <div className="admin-list">
          {activity.map((a) => (
            <div className="admin-list-row" key={a.key}>
              <div className="admin-list-main">
                <div className="admin-list-title">{a.title}</div>
                <div className="admin-list-sub">{a.sub || "—"}</div>
              </div>
              <div className="admin-list-aside">
                {a.badge && <Badge>{a.badge}</Badge>}
                <span className="admin-cell-muted">{timeAgo(a.at)}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "inquiries",
      label: "Inquiries",
      count: inquiries.length,
      content: inquiries.length === 0 ? (
        <Empty text="No inquiries." />
      ) : (
        <div className="admin-list">
          {inquiries.map((iq) => (
            <div className="admin-list-row" key={iq.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{iq.subject || humanize(iq.type)}</div>
                <div className="admin-list-sub">
                  {humanize(iq.type)} · {iq.source || "—"} · {timeAgo(iq.created_at)}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={statusTone(iq.status)}>{humanize(iq.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "deals",
      label: "Deals",
      count: deals.length,
      content: deals.length === 0 ? (
        <Empty text="No deals." />
      ) : (
        <div className="admin-list">
          {deals.map((d) => (
            <div className="admin-list-row" key={d.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{d.title || "Untitled deal"}</div>
                <div className="admin-list-sub">{timeAgo(d.created_at)}</div>
              </div>
              <div className="admin-list-aside">
                <strong className="admin-cell-mono">{formatCents(d.amount_usd_cents, "usd")}</strong>
                <Badge tone={statusTone(d.status)}>{humanize(d.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "orders",
      label: "Orders",
      count: orders.length,
      content: orders.length === 0 ? (
        <Empty text="No orders." />
      ) : (
        <div className="admin-list">
          {orders.map((o) => (
            <div className="admin-list-row" key={o.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{formatCents(o.amount_usd_cents, "usd")}</div>
                <div className="admin-list-sub">
                  {humanize(o.payment_method)} · {formatDate(o.created_at)}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "bookings",
      label: "AIO Pad",
      count: bookings.length,
      content: bookings.length === 0 ? (
        <Empty text="No bookings." />
      ) : (
        <div className="admin-list">
          {bookings.map((b) => (
            <div className="admin-list-row" key={b.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{humanize(b.kind)}</div>
                <div className="admin-list-sub">
                  {formatDate(b.start_date)} → {formatDate(b.end_date)}
                  {b.party_size ? ` · party of ${b.party_size}` : ""}
                </div>
              </div>
              <div className="admin-list-aside">
                <strong className="admin-cell-mono">{formatCents(b.amount_usd_cents, "usd")}</strong>
                <Badge tone={statusTone(b.status)}>{humanize(b.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "recruiting",
      label: "Recruiting",
      count: applications.length,
      content: applications.length === 0 && !candidateProfile?.headline && !candidateProfile?.do_not_hire ? (
        <Empty text="No applications." />
      ) : (
        <div>
          {(candidateProfile?.headline || candidateProfile?.do_not_hire) && (
            <div className="admin-list-row">
              <div className="admin-list-main">
                <div className="admin-list-title">{candidateProfile?.headline || candidateProfile?.current_title || "Applicant"}</div>
                <div className="admin-list-sub">
                  {person.linkedin_url ? (
                    <a href={person.linkedin_url} target="_blank" rel="noreferrer">
                      LinkedIn
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              {candidateProfile?.do_not_hire && (
                <div className="admin-list-aside">
                  <Badge tone="err">Do not hire</Badge>
                </div>
              )}
            </div>
          )}
          {applications.length === 0 ? (
            <Empty text="No applications." />
          ) : (
            <div className="admin-list u-mt-2">
              {applications.map((a) => (
                <div className="admin-list-row" key={a.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">{a.job_title || "Application"}</div>
                    <div className="admin-list-sub">
                      Applied {formatDate(a.applied_at ?? a.created_at)}
                      {a.rating ? ` · ★ ${a.rating}` : ""}
                      {a.resume_document_id ? (
                        <>
                          {" · "}
                          <a href={`/admin/talent/resume/${a.resume_document_id}`} target="_blank" rel="noreferrer">
                            Resume ↗
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone={statusTone(a.status)}>{humanize(a.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "documents",
      label: "Documents",
      count: documents.length,
      content: documents.length === 0 ? (
        <Empty text="No documents." />
      ) : (
        <div className="admin-list">
          {documents.map((doc) => (
            <div className="admin-list-row" key={doc.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{doc.title || "Document"}</div>
                <div className="admin-list-sub">
                  {doc.mime_type || "—"} · {formatDate(doc.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "surveys",
      label: "Surveys",
      count: surveyResponses.length,
      content: surveyResponses.length === 0 ? (
        <Empty text="No survey responses." />
      ) : (
        <div className="admin-list">
          {surveyResponses.map((s) => (
            <div className="admin-list-row" key={s.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">Survey response</div>
                <div className="admin-list-sub">{formatDate(s.submitted_at ?? s.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/contacts">← Contacts</Link>}
        title={name}
        sub={person.email}
        action={
          <div className="u-stack u-items-end" /* layout-ok: no cross-axis end utility (needs .u-items-end) */>
            <span className="u-row u-wrap">
              {person.archived_at && <Badge tone="neutral">Archived</Badge>}
              {person.do_not_contact && <Badge tone="err">Do not contact</Badge>}
              {person.is_team_member && <Badge tone="info">Team</Badge>}
              {isCustomer && <Badge tone="ok">Customer</Badge>}
              {!isCustomer && lead && (
                <Badge tone="info">Lead · {humanize(lead.status)}</Badge>
              )}
              {person.persona && <Badge>{humanize(person.persona)}</Badge>}
              {isApplicant && latestApplication && (
                <ApplicantStatusSelect
                  applicationId={latestApplication.id}
                  status={latestApplication.status}
                  label="Applicant status"
                />
              )}
              {!isApplicant &&
                !person.do_not_contact &&
                !person.is_team_member &&
                !isCustomer &&
                (!lead || ["unqualified", "nurture"].includes(lead.status)) && (
                  <PromoteButton personId={person.id} />
                )}
            </span>
            <CrmCommandBar
              kind="contact"
              id={person.id}
              name={name}
              archived={!!person.archived_at}
              assumeCompanyId={primaryCompany?.company_id ?? null}
            />
          </div>
        }
      />

      <div className="admin-360">
        <div>
          <div className="admin-card admin-section-card">
            <PersonEditForm person={person} />
          </div>
          <div className="admin-card admin-section-card">
            <dl className="admin-kv">
              <dt>Email</dt>
              <dd>{person.email}</dd>
              <dt>Company</dt>
              <dd>
                {primaryCompany ? (
                  <Link href={`/admin/revenue/companies/${primaryCompany.company_id}`}>
                    {primaryCompany.name || "—"}
                  </Link>
                ) : (
                  "—"
                )}
                {primaryCompany?.title ? ` · ${primaryCompany.title}` : ""}
              </dd>
              <dt>Location</dt>
              <dd>{location || "—"}</dd>
              <dt>Timezone</dt>
              <dd>{person.timezone || "—"}</dd>
              <dt>Source</dt>
              <dd>{person.source || "—"}</dd>
              <dt>Added</dt>
              <dd>{formatDate(person.created_at)}</dd>
            </dl>
          </div>
        </div>

        {/* Main column carries the relationship content so its height matches the
            sidebar: Activity, then the affiliate panel, then portal + danger. */}
        <div className="admin-360-main">
          <div className="admin-card admin-section-card">
            <Tabs tabs={tabs} />
          </div>

          {isAffiliate && affiliate && <ContactAffiliatePanel affiliate={affiliate} />}

          {!person.is_team_member && companies.length > 0 && (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">Client portal</h2>
              <div className="admin-list">
                {companies.map((c) => (
                  <div className="admin-list-row" key={c.company_id}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">{c.name || "—"}</div>
                    </div>
                    <div className="admin-list-aside">
                      <PortalMemberControls
                        personId={person.id}
                        companyId={c.company_id}
                        active={membershipByCompany.get(c.company_id)?.status === "active"}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="admin-card admin-section-card">
            <PersonDangerZone
              personId={person.id}
              personName={name}
            />
          </div>
        </div>
      </div>
    </>
  );
}
