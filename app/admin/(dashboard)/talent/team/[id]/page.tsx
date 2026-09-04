import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge, statusTone } from "@/components/admin/Badge";
import { InvitePortalButton } from "@/components/admin/InvitePortalButton";
import { ContractStartForm } from "./ContractStartForm";
import { getSignedInAuthUserIds, portalStatusOf } from "@/lib/admin/portal-status";
import { listCustodyForPerson } from "@/lib/admin/equipment";
import { AssignmentsBlock } from "@/components/admin/AssignmentsBlock";
import { AvatarUpload } from "@/components/team/AvatarUpload";
import { SensitiveDetails } from "@/components/admin/SensitiveDetails";
import { getPeopleSensitive } from "@/lib/admin/people-sensitive";
import { getSensitiveViewer } from "@/lib/admin-auth";
import { getSalaryHistory } from "@/lib/admin/compensation";
import { CompensationSection } from "./CompensationSection";
import { adminSetPersonAvatar, saveSensitiveDetails, saveContractStartDate, saveSalaryChange } from "../actions";
import { SendReviewButton } from "./SendReviewButton";
import {
  getMemberReviewHistory,
  computeNextReview,
  hasProbationReview,
  REVIEW_TYPE_LABEL,
} from "@/lib/reviews";
import { PreviewRow } from "@/components/admin/PreviewRow";
import { ReviewHistoryTable } from "@/components/admin/ReviewHistoryTable";
import { getPersonSurveyResponses } from "@/lib/admin/surveys";
import { getAssignmentsForTeamMember, listAssignableCompanies } from "@/lib/admin/staff-assignments";
import { formatDate, humanize } from "@/lib/admin/format";
import {
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  formatLeaveBalance,
  statusTone as leaveStatusTone,
} from "@/lib/admin/time-off";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team member",
  description: "Employment, leave policy, and time-off history for one team member.",
};

// Talent → Team member profile. Everything about one team member (employment,
// leave policy, schedule, balance, time-off history) in one place. Sourced from
// company_os.team_directory — no link into the sales Contact 360.
type DirectoryRow = {
  id: string;
  person_id: string | null;
  full_name: string | null;
  email: string;
  auth_user_id: string | null;
  status: string | null;
  employee_number: string | null;
  employment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  department_name: string | null;
  position_title: string | null;
  manager_name: string | null;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  used_days: number | string | null;
  total_days: number | string | null;
};

type LeaveRow = {
  id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  days: number | string | null;
  reason: string | null;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

export default async function TeamMemberPage({ params }: { params: { id: string } }) {
  const [memberRes, leaveRes] = await Promise.all([
    companyOs.from("team_directory").select("*").eq("id", params.id).maybeSingle(),
    companyOs
      .from("time_off")
      .select("id, leave_type, status, start_date, end_date, is_half_day, days, reason")
      .eq("team_member_id", params.id)
      .order("start_date", { ascending: false })
      .limit(100),
  ]);

  const m = memberRes.data as DirectoryRow | null;
  if (!m) notFound();

  // Wages/PII are gated to Dave & Mai. A plain admin (My, Quan) never has the
  // sensitive data fetched — not just hidden. Checked server-side here.
  const viewer = await getSensitiveViewer();
  const canSeePII = viewer?.canViewSensitive ?? false;

  // Everything below keys only on the now-known directory row (person_id /
  // auth_user_id / team member id) and nothing depends on anything else here, so
  // fire it all in one parallel wave instead of four serial ones. Survey
  // responses, avatar, and PII are person-keyed — skipped when there's no linked
  // person (nothing could be attributed to the row).
  const [surveyResponses, assignments, assignableCompanies, avatarRes, sensitive, signedInIds, cycleRes, salaryHistory, custody, reviewHistory, probationDone] =
    await Promise.all([
      m.person_id ? getPersonSurveyResponses(m.person_id) : Promise.resolve([]),
      getAssignmentsForTeamMember(m.id),
      listAssignableCompanies(),
      m.person_id
        ? companyOs
            .from("people")
            .select(
              canSeePII
                ? "avatar_url, graduated_from, emergency_contact_name, emergency_contact_phone, metadata"
                : "avatar_url, graduated_from, metadata",
            )
            .eq("id", m.person_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      canSeePII && m.person_id ? getPeopleSensitive(m.person_id) : Promise.resolve(null),
      m.auth_user_id ? getSignedInAuthUserIds([m.auth_user_id]) : Promise.resolve(new Set<string>()),
      companyOs
        .from("team_members")
        .select("employment_stage, probation_ends_on, contract_start_date")
        .eq("id", params.id)
        .maybeSingle(),
      canSeePII ? getSalaryHistory(m.id) : Promise.resolve([]),
      m.person_id ? listCustodyForPerson(m.person_id) : Promise.resolve([]),
      getMemberReviewHistory(m.id),
      hasProbationReview(m.id),
    ]);
  const cycle = cycleRes.data as {
    employment_stage: string | null;
    probation_ends_on: string | null;
    contract_start_date: string | null;
  } | null;
  const person = avatarRes.data as {
    avatar_url: string | null;
    graduated_from: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
  const avatarUrl = person?.avatar_url ?? null;
  const portalStatus = portalStatusOf(m.auth_user_id, signedInIds);

  // Personal details collected at onboarding (mapped onto `people`). Restricted
  // PII stays in the Sensitive details card; this is the get-to-know-you slice.
  const funStuff = (person?.metadata?.fun_stuff ?? null) as
    | { interests?: unknown; note?: unknown }
    | null;
  const hobbies = Array.isArray(funStuff?.interests)
    ? (funStuff!.interests as unknown[]).filter((h): h is string => typeof h === "string")
    : [];
  const funFact = typeof funStuff?.note === "string" && funStuff.note.trim() ? funStuff.note : null;
  const graduatedFrom = person?.graduated_from || null;
  const emergencyContact = canSeePII
    ? [person?.emergency_contact_name, person?.emergency_contact_phone].filter(Boolean).join(" · ") || null
    : null;
  const hasPersonal = Boolean(graduatedFrom || emergencyContact || hobbies.length || funFact);

  const requests = (leaveRes.data ?? []) as LeaveRow[];
  // Open custody periods are what actually matters at offboarding: anything
  // without a returned_at is still physically with this person.
  const heldNow = custody.filter((c) => !c.returned_at);
  const isLeaving = m.status === "notice" || m.status === "terminated" || m.status === "alumni";
  const name = m.full_name || m.email;

  // Next scheduled review (informational estimate; the scheduler that actually
  // fires cycles is a later slice). Saigon "today" matches the probation cron.
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const nextReview = computeNextReview({
    startDate: m.start_date ? m.start_date.slice(0, 10) : null,
    contractStartDate: cycle?.contract_start_date ? cycle.contract_start_date.slice(0, 10) : null,
    hasProbationReview: probationDone,
    todayISO,
  });
  const nextReviewOverdue = nextReview ? nextReview.date < todayISO : false;
  // Pre-select the send button on the soonest scheduled type, ad-hoc otherwise.
  const defaultReviewType = nextReview?.type ?? "adhoc";
  const total = num(m.total_days);
  const used = num(m.used_days);
  const remaining = total !== null && used !== null ? Math.round((total - used) * 10) / 10 : null;

  return (
    <>
      <div className="u-row-top u-gap-4">
        {m.person_id && (
          <AvatarUpload
            name={name}
            avatarUrl={avatarUrl}
            action={adminSetPersonAvatar.bind(null, m.person_id)}
            size={60}
          />
        )}
        <div className="u-grow u-min-0">
          <PageHead
            eyebrow={<Link href="/admin/talent/team">← Team</Link>}
            title={name}
            sub={[m.position_title, m.email].filter(Boolean).join(" · ")}
            action={
              m.status ? <Badge tone={statusTone(m.status)}>{humanize(m.status)}</Badge> : undefined
            }
          />
        </div>
      </div>

      {total !== null && (
        <div className="admin-kpi-grid u-mb-5">
          <MetricCard label="Entitled" value={formatLeaveBalance(total)} sub="days this period" />
          <MetricCard label="Used" value={formatLeaveBalance(used)} sub="days taken" />
          <MetricCard
            label="Remaining"
            value={remaining !== null ? formatLeaveBalance(remaining) : "—"}
            sub="days left"
          />
        </div>
      )}

      <div className="admin-360">
        <div>
          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Employment</h2>
            <dl className="admin-kv">
              <dt>Team</dt>
              <dd>{m.team || "—"}</dd>
              <dt>Department</dt>
              <dd>{m.department_name || "—"}</dd>
              <dt>Position</dt>
              <dd>{m.position_title || "—"}</dd>
              <dt>Approver</dt>
              <dd>{m.manager_name || "—"}</dd>
              <dt>Employment type</dt>
              <dd>{m.employment_type ? humanize(m.employment_type) : "—"}</dd>
              <dt>Employee #</dt>
              <dd>{m.employee_number || "—"}</dd>
              <dt>Location</dt>
              <dd>{m.location || "—"}</dd>
              <dt>Start date</dt>
              <dd>{m.start_date ? formatDate(m.start_date) : "—"}</dd>
              {cycle?.employment_stage && (
                <>
                  <dt>Stage</dt>
                  <dd>{humanize(cycle.employment_stage)}</dd>
                </>
              )}
              {cycle?.probation_ends_on && (
                <>
                  <dt>Probation ends</dt>
                  <dd>{formatDate(cycle.probation_ends_on)}</dd>
                </>
              )}
              <dt>Contract start</dt>
              <dd>
                {/* Admin-editable: when the full-time labor contract begins. A
                    probation extension moves it +30 automatically; this is the
                    manual control. */}
                <ContractStartForm
                  action={saveContractStartDate.bind(null, m.id)}
                  defaultValue={cycle?.contract_start_date ?? ""}
                />
              </dd>
              {m.end_date && (
                <>
                  <dt>End date</dt>
                  <dd>{formatDate(m.end_date)}</dd>
                </>
              )}
            </dl>
          </div>

          {hasPersonal && (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">Personal</h2>
              <dl className="admin-kv">
                {graduatedFrom && (
                  <>
                    <dt>Graduated from</dt>
                    <dd>{graduatedFrom}</dd>
                  </>
                )}
                {emergencyContact && (
                  <>
                    <dt>Emergency contact</dt>
                    <dd>{emergencyContact}</dd>
                  </>
                )}
                {hobbies.length > 0 && (
                  <>
                    <dt>Interests</dt>
                    <dd>{hobbies.join(", ")}</dd>
                  </>
                )}
                {funFact && (
                  <>
                    <dt>Fun fact</dt>
                    <dd>{funFact}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Leave</h2>
            <dl className="admin-kv">
              <dt>Leave policy</dt>
              <dd>{m.leave_policy || "—"}</dd>
              <dt>Work schedule</dt>
              <dd>{m.work_schedule || "—"}</dd>
            </dl>
          </div>

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Portal access</h2>
            <p className="admin-page-sub u-mt-0">{m.email}</p>
            {!m.person_id ? (
              <span className="admin-cell-muted">No linked person record.</span>
            ) : m.status === "terminated" || m.status === "alumni" ? (
              // Past employees are never (re-)invited: show standing status only.
              <span className="admin-cell-muted">
                {portalStatus === "active" ? "Signed in" : portalStatus === "invited" ? "Invited, never signed in" : "Not invited"}
              </span>
            ) : (
              <InvitePortalButton teamMemberId={m.id} status={portalStatus} full />
            )}
          </div>

          <AssignmentsBlock
            teamMemberId={m.id}
            assignments={assignments}
            companies={assignableCompanies}
          />
        </div>

        <div>
          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Reviews ({reviewHistory.length})</h2>
            <dl className="admin-kv u-mb-4">
              <dt>Next review</dt>
              <dd>
                {nextReview ? (
                  <>
                    {REVIEW_TYPE_LABEL[nextReview.type]} · {formatDate(nextReview.date)}
                    {nextReviewOverdue && (
                      <>
                        {" "}
                        <Badge tone="warn">Overdue</Badge>
                      </>
                    )}
                  </>
                ) : (
                  <span className="admin-cell-muted">Set a start or contract date to schedule.</span>
                )}
              </dd>
            </dl>

            <div className={reviewHistory.length ? "u-mb-4" : undefined}>
              <SendReviewButton teamMemberId={m.id} defaultType={defaultReviewType} />
            </div>

            {reviewHistory.length > 0 && <ReviewHistoryTable cycles={reviewHistory} />}
          </div>

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Time off ({requests.length})</h2>
            {requests.length === 0 ? (
              <div className="admin-empty">No time-off requests yet.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => {
                      const days =
                        num(r.days) ?? countWorkingDays(r.start_date, r.end_date, r.is_half_day);
                      const range =
                        r.start_date === r.end_date
                          ? formatDate(r.start_date) + (r.is_half_day ? " (half)" : "")
                          : `${formatDate(r.start_date)} → ${formatDate(r.end_date)}`;
                      return (
                        <tr key={r.id}>
                          <td>
                            {LEAVE_TYPE_LABEL[r.leave_type as keyof typeof LEAVE_TYPE_LABEL] ??
                              humanize(r.leave_type)}
                          </td>
                          <td>{range}</td>
                          <td>{days > 0 ? formatDays(days) : "—"}</td>
                          <td>
                            <Badge tone={leaveStatusTone(r.status)}>{humanize(r.status)}</Badge>
                          </td>
                          <td className="admin-cell-muted">{r.reason || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Equipment ({heldNow.length})</h2>
            {custody.length === 0 ? (
              <div className="admin-empty">Nothing has been assigned to this person.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Tag</th>
                      <th>Type</th>
                      <th>Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custody.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="admin-cell-strong">{c.equipment?.name ?? "Removed item"}</span>
                          {c.equipment?.serial_number && (
                            <div className="admin-cell-muted">{c.equipment.serial_number}</div>
                          )}
                        </td>
                        <td className="admin-cell-mono">{c.equipment?.asset_tag ?? "—"}</td>
                        <td>{c.equipment ? humanize(c.equipment.type) : "—"}</td>
                        <td>
                          {formatDate(c.assigned_at)} →{" "}
                          {c.returned_at ? (
                            formatDate(c.returned_at)
                          ) : (
                            <Badge tone="ok">Still has it</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isLeaving && heldNow.length > 0 && (
              <div className="admin-alert admin-alert--err u-mt-3">
                Leaving with {heldNow.length} {heldNow.length === 1 ? "item" : "items"} still out.
                Close {heldNow.length === 1 ? "it" : "them"} on the{" "}
                <Link href="/admin/operations/equipment">equipment register</Link> before the last day.
              </div>
            )}
          </div>

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Survey responses ({surveyResponses.length})</h2>
            {surveyResponses.length === 0 ? (
              <div className="admin-empty">No survey responses yet.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Survey</th>
                      <th>Submitted</th>
                      <th className="u-right">Answered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surveyResponses.map((s) => (
                      <PreviewRow
                        key={s.id}
                        title={s.surveyName}
                        eyebrow={`Submitted ${formatDate(s.submittedAt)}`}
                        preview={
                          <div className="u-stack u-gap-4">
                            {s.fields.map((f) => (
                              <div key={f.fieldId}>
                                <div className="admin-cell-muted">{f.label}</div>
                                <div>
                                  {f.sensitive ? (
                                    <span className="admin-cell-muted">🔒 Hidden — see Sensitive details</span>
                                  ) : (
                                    f.value ?? "—"
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        }
                      >
                        <td className="admin-cell-strong">{s.surveyName}</td>
                        <td title={formatDate(s.submittedAt)}>{formatDate(s.submittedAt)}</td>
                        <td className="admin-cell-mono u-right">
                          {s.answeredCount}/{s.fieldCount}
                        </td>
                      </PreviewRow>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {canSeePII && (
            <CompensationSection
              history={salaryHistory}
              startDate={m.start_date}
              action={saveSalaryChange.bind(null, m.id)}
            />
          )}
          {m.person_id && canSeePII && (
            <SensitiveDetails
              row={sensitive}
              hasIdFront={!!sensitive?.id_front_path}
              hasIdBack={!!sensitive?.id_back_path}
              idImageBaseHref={`/admin/talent/team/${m.id}/id-image`}
              selfieUrl={avatarUrl}
              action={saveSensitiveDetails.bind(null, m.person_id)}
            />
          )}
          {m.person_id && !canSeePII && (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">Sensitive details</h2>
              <p className="admin-cell-muted">Restricted — visible to Dave and Mai only.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
