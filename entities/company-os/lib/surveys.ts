// Survey responses read for the admin screens. The vocabulary, row shapes and
// validation live in ./surveys-schema (browser-safe, behind the client door);
// every caller of this module still finds them here.
export * from "./surveys-schema";
import { isSensitiveSurveyField, type FieldConfig } from "./surveys-schema";
import { companyOs } from "@/kernel/data/supabase";

// ---- one person's survey responses (Team member profile) ----

// A single completed response with every question and this person's answer, for
// the side-car drawer. Only non-anonymous surveys carry a person_id (the runner
// stores null for anonymous ones), so querying by person_id never de-anonymizes.
export type PersonSurveyResponse = {
  id: string;
  surveyId: string;
  surveyName: string;
  submittedAt: string;
  answeredCount: number;
  fieldCount: number;
  fields: { fieldId: string; label: string; value: string | null; sensitive: boolean }[];
};

export async function getPersonSurveyResponses(personId: string): Promise<PersonSurveyResponse[]> {
  const { data } = await companyOs
    .from("survey_responses")
    .select("id, survey_id, submitted_at, created_at, surveys!survey_id(name)")
    .eq("person_id", personId)
    .order("submitted_at", { ascending: false, nullsFirst: false });
  const responses = (data ?? []) as Array<{
    id: string;
    survey_id: string;
    submitted_at: string | null;
    created_at: string;
    surveys: { name: string } | { name: string }[] | null;
  }>;
  if (responses.length === 0) return [];

  const surveyIds = [...new Set(responses.map((r) => r.survey_id))];
  const responseIds = responses.map((r) => r.id);

  const [fieldsRes, answersRes] = await Promise.all([
    companyOs
      .from("survey_fields")
      .select("id, survey_id, label, config")
      .in("survey_id", surveyIds)
      .order("position", { ascending: true }),
    companyOs.from("survey_answers").select("response_id, field_id, value").in("response_id", responseIds),
  ]);

  // Fields grouped by survey (kept in position order by the query above). The
  // sensitivity flag lets the profile hide restricted PII answers, so the
  // side-car never re-exposes what the reveal-gated card guards.
  const fieldsBySurvey = new Map<string, { id: string; label: string; sensitive: boolean }[]>();
  for (const f of (fieldsRes.data ?? []) as Array<{
    id: string;
    survey_id: string;
    label: string;
    config: FieldConfig | null;
  }>) {
    const arr = fieldsBySurvey.get(f.survey_id) ?? [];
    arr.push({ id: f.id, label: f.label, sensitive: isSensitiveSurveyField(f) });
    fieldsBySurvey.set(f.survey_id, arr);
  }

  // Answers grouped by response: field_id → value.
  const answersByResponse = new Map<string, Map<string, string | null>>();
  for (const a of (answersRes.data ?? []) as Array<{ response_id: string; field_id: string; value: string | null }>) {
    const m = answersByResponse.get(a.response_id) ?? new Map<string, string | null>();
    m.set(a.field_id, a.value);
    answersByResponse.set(a.response_id, m);
  }

  return responses.map((r) => {
    const survey = Array.isArray(r.surveys) ? r.surveys[0] : r.surveys;
    const fields = fieldsBySurvey.get(r.survey_id) ?? [];
    const answers = answersByResponse.get(r.id) ?? new Map<string, string | null>();
    return {
      id: r.id,
      surveyId: r.survey_id,
      surveyName: survey?.name ?? "Survey",
      submittedAt: r.submitted_at ?? r.created_at,
      answeredCount: answers.size,
      fieldCount: fields.length,
      fields: fields.map((f) => ({
        fieldId: f.id,
        label: f.label,
        value: answers.get(f.id) ?? null,
        sensitive: f.sensitive,
      })),
    };
  });
}

export type CompanySurveyResponse = {
  id: string;
  surveyName: string;
  respondentName: string;
  submittedAt: string;
};

// Survey responses from a company's linked people, for the company profile.
// People resolve via company_os.person_companies (surveys have no company_id).
// A summary list only (survey, respondent, date); the full answers, with the
// sensitive-field redaction, stay on the contact profile via
// getPersonSurveyResponses.
export async function getSurveyResponsesForCompany(companyId: string): Promise<CompanySurveyResponse[]> {
  const { data: links } = await companyOs
    .from("person_companies")
    .select("people:people!person_id(id, full_name, email)")
    .eq("company_id", companyId);

  const nameById = new Map<string, string>();
  for (const l of (links ?? []) as Array<{
    people: { id: string; full_name: string | null; email: string | null } | { id: string; full_name: string | null; email: string | null }[] | null;
  }>) {
    const p = Array.isArray(l.people) ? l.people[0] : l.people;
    if (p?.id) nameById.set(p.id, p.full_name || p.email || "Unknown");
  }
  const personIds = [...nameById.keys()];
  if (personIds.length === 0) return [];

  const { data } = await companyOs
    .from("survey_responses")
    .select("id, person_id, submitted_at, created_at, surveys!survey_id(name)")
    .in("person_id", personIds)
    .order("submitted_at", { ascending: false, nullsFirst: false });

  return ((data ?? []) as Array<{
    id: string;
    person_id: string | null;
    submitted_at: string | null;
    created_at: string;
    surveys: { name: string } | { name: string }[] | null;
  }>).map((r) => {
    const survey = Array.isArray(r.surveys) ? r.surveys[0] : r.surveys;
    return {
      id: r.id,
      surveyName: survey?.name ?? "Survey",
      respondentName: (r.person_id && nameById.get(r.person_id)) || "Unknown",
      submittedAt: r.submitted_at ?? r.created_at,
    };
  });
}
