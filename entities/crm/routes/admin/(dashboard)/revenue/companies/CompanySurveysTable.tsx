import { PreviewRow } from "@/kernel/ui/PreviewRow";
import { formatDate } from "@/kernel/ui/format";
import type { CompanySurveyResponse } from "@/entities/org";

// The company's survey responses; a row opens the answers in the side drawer,
// the same as the Team member profile. Sensitive answers stay hidden here.
export function CompanySurveysTable({ surveys }: { surveys: CompanySurveyResponse[] }) {
  if (surveys.length === 0) return <div className="admin-empty">No survey responses from this company&apos;s people yet.</div>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Survey</th>
            <th>Respondent</th>
            <th>Submitted</th>
            <th className="u-right">Answered</th>
          </tr>
        </thead>
        <tbody>
          {surveys.map((s) => (
            <PreviewRow
              key={s.id}
              title={s.surveyName}
              eyebrow={`${s.respondentName} · submitted ${formatDate(s.submittedAt)}`}
              preview={
                <div className="u-stack u-gap-4">
                  {s.fields.map((f) => (
                    <div key={f.fieldId}>
                      <div className="admin-cell-muted">{f.label}</div>
                      <div>{f.sensitive ? <span className="admin-cell-muted">Hidden: sensitive answer</span> : (f.value ?? "—")}</div>
                    </div>
                  ))}
                </div>
              }
            >
              <td className="admin-cell-strong">{s.surveyName}</td>
              <td>{s.respondentName}</td>
              <td>{formatDate(s.submittedAt)}</td>
              <td className="admin-cell-mono u-right">
                {s.answeredCount}/{s.fieldCount}
              </td>
            </PreviewRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
