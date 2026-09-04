import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/admin/Badge";
import { PreviewRow } from "@/components/admin/PreviewRow";
import { formatDate, timeAgo } from "@/lib/admin/format";
import {
  FIELD_TYPE_LABEL,
  isNpsConfig,
  isSensitiveSurveyField,
  parseStoredAnswer,
  ratingBounds,
  surveyStatusTone,
  type FieldType,
  type SurveyFieldRow,
  type SurveyRow,
} from "@/lib/admin/surveys";
import { one, type Embedded } from "@/lib/embedded";

export const dynamic = "force-dynamic";

type ResponseRow = {
  id: string;
  respondent_kind: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  person_id: string | null;
  submitted_at: string;
  people: Embedded<{ full_name: string | null; email: string }>;
};

type AnswerRow = {
  id: string;
  response_id: string;
  field_id: string;
  value: string | null;
  value_json: unknown;
};

// Restricted PII (any answer mapped into people_sensitive) is never rendered in
// the survey view. It lives — reveal-gated and audited — on the employee profile
// the respondent name links to. The selfie is exempt (it is a public avatar).
function Redacted() {
  return (
    <span className="admin-cell-muted u-row">
      <span aria-hidden>🔒</span> Hidden — see employee profile
    </span>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="admin-meter admin-meter--flat">
      <div className="admin-meter-fill" style={{ width: `${Math.max(2, Math.round(pct))}%` }} /* layout-ok: data-driven width */ />
    </div>
  );
}

function DistRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="u-row">
      <span style={{ minWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <Bar pct={pct} />
      <span className="admin-cell-mono u-right u-min-1">
        {count} · {Math.round(pct)}%
      </span>
    </div>
  );
}

function FieldAggregate({ field, values }: { field: SurveyFieldRow; values: NonNullable<ReturnType<typeof parseStoredAnswer>>[] }) {
  const type = field.type as FieldType;
  const total = values.length;

  if (type === "rating") {
    const nums = values.filter((v): v is number => typeof v === "number");
    const { min, max } = ratingBounds(field.config);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    const nps = isNpsConfig(field.config)
      ? (() => {
          const promoters = nums.filter((n) => n >= 9).length;
          const detractors = nums.filter((n) => n <= 6).length;
          return nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : null;
        })()
      : null;
    return (
      <div className="u-stack">
        <div className="u-row u-gap-4">
          <span className="admin-kpi-val">{avg === null ? "—" : avg.toFixed(1)}</span>
          <span className="admin-cell-muted">average of {nums.length}</span>
          {nps !== null && (
            <>
              <span className="admin-kpi-val">{nps > 0 ? `+${nps}` : nps}</span>
              <span className="admin-cell-muted">NPS</span>
            </>
          )}
        </div>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <DistRow key={n} label={String(n)} count={nums.filter((v) => v === n).length} total={nums.length} />
        ))}
      </div>
    );
  }

  if (type === "single_choice" || type === "multi_choice") {
    const choices = field.config?.choices ?? [];
    const counts = new Map<string, number>(choices.map((c) => [c, 0]));
    for (const v of values) {
      for (const c of Array.isArray(v) ? v : [v]) {
        if (typeof c === "string") counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    return (
      <div className="u-stack">
        {[...counts.entries()].map(([choice, count]) => (
          <DistRow key={choice} label={choice} count={count} total={total} />
        ))}
      </div>
    );
  }

  if (type === "yes_no") {
    const yes = values.filter((v) => v === true).length;
    const no = values.filter((v) => v === false).length;
    return (
      <div className="u-stack">
        <DistRow label="Yes" count={yes} total={total} />
        <DistRow label="No" count={no} total={total} />
      </div>
    );
  }

  const texts = values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return texts.length === 0 ? (
    <div className="admin-empty">No answers yet.</div>
  ) : (
    <div className="u-stack admin-scroll-sm">
      {texts.slice(0, 50).map((t, i) => (
        <div key={i} className="admin-quote">
          {t}
        </div>
      ))}
      {texts.length > 50 && (
        <div className="admin-cell-muted">Showing 50 of {texts.length} answers.</div>
      )}
    </div>
  );
}

export default async function SurveyResultsPage({ params }: { params: { id: string } }) {
  const [surveyRes, fieldsRes, responsesRes] = await Promise.all([
    companyOs
      .from("surveys")
      .select(
        "id, slug, name, description, status, is_anonymous, intro_text, thank_you_text, created_at, updated_at",
      )
      .eq("id", params.id)
      .maybeSingle(),
    companyOs
      .from("survey_fields")
      .select("id, survey_id, position, type, label, help_text, required, config")
      .eq("survey_id", params.id)
      .order("position", { ascending: true }),
    companyOs
      .from("survey_responses")
      .select(
        "id, respondent_kind, respondent_name, respondent_email, person_id, submitted_at, people!person_id(full_name, email)",
      )
      .eq("survey_id", params.id)
      .order("submitted_at", { ascending: false })
      .limit(500),
  ]);

  const survey = surveyRes.data as SurveyRow | null;
  if (!survey) notFound();
  const fields = (fieldsRes.data ?? []) as SurveyFieldRow[];
  const responses = (responsesRes.data ?? []) as ResponseRow[];

  // Answers per field (drives both aggregates and the per-response drawer).
  const answersByField = new Map<string, AnswerRow[]>();
  await Promise.all(
    fields.map(async (f) => {
      const { data } = await companyOs
        .from("survey_answers")
        .select("id, response_id, field_id, value, value_json")
        .eq("field_id", f.id)
        .limit(2000);
      answersByField.set(f.id, (data ?? []) as AnswerRow[]);
    }),
  );

  const answersByResponse = new Map<string, Map<string, AnswerRow>>();
  for (const [fieldId, rows] of answersByField) {
    for (const a of rows) {
      let m = answersByResponse.get(a.response_id);
      if (!m) answersByResponse.set(a.response_id, (m = new Map()));
      m.set(fieldId, a);
    }
  }

  const teamCount = responses.filter((r) => r.respondent_kind === "team").length;
  const clientCount = responses.filter((r) => r.respondent_kind === "client").length;
  const externalCount = responses.length - teamCount - clientCount;

  // Deep-link each linked respondent to their employee profile. Survey responses
  // carry person_id, but the profile route keys on team_directory.id (a distinct
  // id), so resolve that mapping once for every person in view. Anonymous surveys
  // never link (they carry no person).
  const personIds = [...new Set(responses.map((r) => r.person_id).filter((id): id is string => !!id))];
  const profileHrefByPerson = new Map<string, string>();
  if (!survey.is_anonymous && personIds.length > 0) {
    const { data: dir } = await companyOs
      .from("team_directory")
      .select("id, person_id")
      .in("person_id", personIds);
    for (const row of (dir ?? []) as { id: string; person_id: string | null }[]) {
      if (row.person_id) profileHrefByPerson.set(row.person_id, `/admin/talent/team/${row.id}`);
    }
  }

  function respondentLabel(r: ResponseRow): string {
    if (survey!.is_anonymous) return "Anonymous";
    const person = one(r.people);
    return person?.full_name || r.respondent_name || person?.email || r.respondent_email || "Unknown";
  }

  const respondentHref = (r: ResponseRow): string | null =>
    r.person_id ? profileHrefByPerson.get(r.person_id) ?? null : null;

  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/admin/operations/surveys/${survey.id}`} className="u-link-plain">
            Operations · Surveys · {survey.name}
          </Link>
        }
        title="Results"
        sub={survey.description ?? undefined}
        action={
          <Link href={`/admin/operations/surveys/${survey.id}`} className="admin-btn">
            Edit survey
          </Link>
        }
      />

      <div className="u-row u-mb-4">
        <Badge tone={surveyStatusTone(survey.status)}>{survey.status}</Badge>
        {survey.is_anonymous && <Badge tone="info">anonymous</Badge>}
      </div>

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Responses" value={responses.length} />
        <MetricCard label="Team" value={teamCount} />
        <MetricCard label="Client" value={clientCount} />
        <MetricCard label="External" value={externalCount} />
      </div>

      {fields.length === 0 ? (
        <div className="admin-empty">This survey has no questions.</div>
      ) : (
        <div className="u-stack u-gap-5 u-mb-5">
          {fields.map((f, i) => {
            const sensitive = isSensitiveSurveyField(f);
            const rows = answersByField.get(f.id) ?? [];
            const values = rows
              .map((a) => parseStoredAnswer(f, a))
              .filter((v): v is NonNullable<typeof v> => v !== null);
            return (
              <div className="admin-card admin-section-card" key={f.id}>
                <h2 className="admin-card-title">
                  {i + 1}. {f.label}
                </h2>
                <div className="admin-cell-muted u-mb-3">
                  {FIELD_TYPE_LABEL[f.type as FieldType] ?? f.type} · {values.length} answer
                  {values.length === 1 ? "" : "s"}
                </div>
                {sensitive ? (
                  <Redacted />
                ) : f.type === "file" ? (
                  <div className="admin-cell-muted">{values.length} uploaded</div>
                ) : (
                  <FieldAggregate field={f} values={values} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Responses</h2>
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Respondent</th>
                  <th>Kind</th>
                  <th className="u-right">Answered</th>
                </tr>
              </thead>
              <tbody>
                {responses.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="admin-empty">No responses yet.</div>
                    </td>
                  </tr>
                ) : (
                  responses.map((r) => {
                    const answers = answersByResponse.get(r.id);
                    const href = respondentHref(r);
                    const cells = (
                      <>
                        <td title={formatDate(r.submitted_at)}>{timeAgo(r.submitted_at)}</td>
                        <td>
                          {href ? (
                            <Link href={href} className="admin-cell-strong" title="Open employee profile">
                              {respondentLabel(r)}
                            </Link>
                          ) : (
                            <span className="admin-cell-strong">{respondentLabel(r)}</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            tone={
                              r.respondent_kind === "team"
                                ? "info"
                                : r.respondent_kind === "client"
                                  ? "ok"
                                  : "neutral"
                            }
                          >
                            {r.respondent_kind ?? "external"}
                          </Badge>
                        </td>
                        <td className="admin-cell-mono u-right">
                          {answers?.size ?? 0}/{fields.length}
                        </td>
                      </>
                    );
                    return (
                      <PreviewRow
                        key={r.id}
                        title={respondentLabel(r)}
                        eyebrow={`Submitted ${formatDate(r.submitted_at)}`}
                        preview={
                          <div className="u-stack u-gap-4">
                            {fields.map((f) => {
                              const value = answers?.get(f.id)?.value ?? null;
                              return (
                                <div key={f.id}>
                                  <div className="admin-cell-muted">{f.label}</div>
                                  <div>
                                    {isSensitiveSurveyField(f) ? (
                                      <Redacted />
                                    ) : f.type === "file" ? (
                                      value ? "Uploaded" : "—"
                                    ) : (
                                      value ?? "—"
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        }
                      >
                        {cells}
                      </PreviewRow>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
