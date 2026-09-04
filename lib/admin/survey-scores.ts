// Average rating score for a survey, on the rating field's own scale. Powers
// the employee-feedback (team-pulse) and client-feedback (ai-capability-pulse)
// tiles; both are 1-5 agree scales today. Returns null when the survey has no
// rating answers yet, so a tile can render "no responses" instead of a fake 0.

import { companyOs } from "@/lib/supabase";

export type SurveyScore = { avg: number | null; responses: number; scale: number };

export async function getSurveyScore(slug: string): Promise<SurveyScore> {
  const surveyRes = await companyOs.from("surveys").select("id").eq("slug", slug).maybeSingle();
  const surveyId = (surveyRes.data as { id: string } | null)?.id;
  if (!surveyId) return { avg: null, responses: 0, scale: 5 };

  const [fieldsRes, respRes] = await Promise.all([
    companyOs.from("survey_fields").select("id, config").eq("survey_id", surveyId).eq("type", "rating"),
    companyOs.from("survey_responses").select("id", { count: "exact", head: true }).eq("survey_id", surveyId),
  ]);

  const fields = (fieldsRes.data as { id: string; config: { max?: number } | null }[] | null) ?? [];
  const fieldIds = fields.map((f) => f.id);
  const scale = fields[0]?.config?.max ?? 5;
  if (!fieldIds.length) return { avg: null, responses: respRes.count ?? 0, scale };

  const answersRes = await companyOs.from("survey_answers").select("value_json, value").in("field_id", fieldIds);
  const answers = (answersRes.data as { value_json: unknown; value: string | null }[] | null) ?? [];

  const nums: number[] = [];
  for (const a of answers) {
    const n = typeof a.value_json === "number" ? a.value_json : a.value != null ? Number(a.value) : NaN;
    if (Number.isFinite(n)) nums.push(n);
  }
  const avg = nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100 : null;
  return { avg, responses: respRes.count ?? 0, scale };
}
