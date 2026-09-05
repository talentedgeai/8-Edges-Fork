import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { countEntity } from "@/entities/company-os/lib/query";
import { PageHead } from "@/kernel/ui/PageHead";
import type { SurveyFieldRow, SurveyRow } from "@/entities/company-os/lib/surveys";
import { SurveyBuilder } from "./SurveyBuilder";

export default async function SurveyBuilderPage({ params }: { params: { id: string } }) {
  const [surveyRes, fieldsRes, responses] = await Promise.all([
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
    countEntity("survey_responses", { survey_id: params.id }),
  ]);

  const survey = surveyRes.data as SurveyRow | null;
  if (!survey) notFound();
  const fields = (fieldsRes.data ?? []) as SurveyFieldRow[];

  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/admin/operations/surveys" className="u-link-plain">
            Operations · Surveys
          </Link>
        }
        title={survey.name}
        sub={survey.description ?? undefined}
        action={
          <Link href={`/admin/operations/surveys/${survey.id}/results`} className="admin-btn">
            Results ({responses})
          </Link>
        }
      />
      <SurveyBuilder survey={survey} fields={fields} responseCount={responses} />
    </>
  );
}
