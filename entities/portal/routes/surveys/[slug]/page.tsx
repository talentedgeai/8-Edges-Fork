import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { resolveSurveyActor } from "@/entities/portal/lib/survey-identity";
import { isAiJourneyPurpose, resolveCompanyPrefill } from "@/entities/assistant";
import { getReviewRunContext, visibleReviewFields, reviewInitialAnswers } from "@/entities/team";
import type { SurveyFieldRow, SurveyRow } from "@/entities/company-os";
import { SurveyRunner } from "./SurveyRunner";
import styles from "./survey.module.css";

// Survey links are shared directly; keep them out of search engines.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { data } = await companyOs
    .from("surveys")
    .select("name, description")
    .eq("slug", params.slug)
    .maybeSingle();
  return {
    title: data ? `${data.name} — Edge8` : "Survey — Edge8",
    description: data?.description ?? undefined,
    robots: { index: false },
  };
}

export default async function PublicSurveyPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { cohort?: string; review?: string };
}) {
  const { data } = await companyOs
    .from("surveys")
    .select(
      "id, slug, name, description, status, is_anonymous, intro_text, thank_you_text, purpose, created_at, updated_at, archived_at",
    )
    .eq("slug", params.slug)
    .maybeSingle();

  const survey = data as (SurveyRow & { archived_at: string | null }) | null;
  if (!survey || survey.archived_at || survey.status === "draft") notFound();

  if (survey.status !== "published") {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{survey.name}</h1>
          <p className={styles.sub}>This survey is closed. Thanks for your interest.</p>
        </div>
      </main>
    );
  }

  // Performance reviews ride the survey runner but are not public surveys:
  // the visitor must be signed in and be the review row's rater. The review
  // row (not the survey) is the record; see lib/reviews.ts.
  if (survey.purpose === "performance_review") {
    const reviewId = searchParams?.review?.trim() ?? "";
    if (!reviewId) notFound();
    const ctx = await getReviewRunContext(reviewId, survey.slug);
    if (ctx === null) {
      // Signed out (or not the rater — indistinguishable on purpose). Send
      // through the portal login; it returns to /team, where Reviews lists
      // the pending link again.
      const actor = await resolveSurveyActor();
      if (!actor) redirect("/team/login");
      notFound();
    }
    if (ctx === "closed") {
      return (
        <main className={styles.page}>
          <div className={styles.card}>
            <h1 className={styles.title}>{survey.name}</h1>
            <p className={styles.sub}>
              This review is already submitted. Find it under Reviews in the team portal.
            </p>
          </div>
        </main>
      );
    }
    const { data: reviewFieldsData } = await companyOs
      .from("survey_fields")
      .select("id, survey_id, position, type, label, help_text, required, config")
      .eq("survey_id", survey.id)
      .order("position", { ascending: true });
    // The manager form carries every decision field; show only the ones this
    // cycle uses (self form has none, so this is a no-op there).
    const reviewFields = visibleReviewFields(
      (reviewFieldsData ?? []) as SurveyFieldRow[],
      ctx.review.review_type,
    );
    // A submitted review is being re-edited: seed the form with its saved
    // answers so nothing looks blank or gets accidentally cleared.
    const initialAnswers =
      ctx.review.status === "submitted" ? reviewInitialAnswers(ctx.review, reviewFields) : undefined;
    return (
      <main className={styles.page}>
        <SurveyRunner
          slug={survey.slug}
          name={survey.name}
          introText={survey.intro_text ?? survey.description}
          thankYouText={survey.thank_you_text}
          isAnonymous={false}
          fields={reviewFields}
          actorName={null}
          needIdentity={false}
          reviewId={ctx.review.id}
          subjectName={ctx.subjectName}
          expectedLevel={ctx.expectedLevel}
          initialAnswers={initialAnswers}
        />
      </main>
    );
  }

  const [fieldsRes, actor] = await Promise.all([
    companyOs
      .from("survey_fields")
      .select("id, survey_id, position, type, label, help_text, required, config")
      .eq("survey_id", survey.id)
      .order("position", { ascending: true }),
    resolveSurveyActor(),
  ]);
  let fields = (fieldsRes.data ?? []) as SurveyFieldRow[];

  // AI Journey: don't re-ask what the CRM already knows. For a logged-in
  // respondent, questions whose config.maps_to value is on file (company name,
  // industry) are hidden here; the submit API injects the known value so the
  // stored response is still complete.
  if (isAiJourneyPurpose(survey.purpose) && !survey.is_anonymous && actor?.personId) {
    const prefill = await resolveCompanyPrefill(actor.personId);
    fields = fields.filter((f) => !(f.config?.maps_to && prefill[f.config.maps_to] !== undefined));
  }

  // Onboarding is for a new hire who is not in the system yet: their identity
  // must come from what they type, never from whoever's browser session is
  // active (a logged-in recruiter previewing the link, say). So always collect
  // name + email and never attribute to the session actor.
  const isOnboarding = survey.purpose === "onboarding";

  return (
    <main className={styles.page}>
      <SurveyRunner
        slug={survey.slug}
        name={survey.name}
        introText={survey.intro_text ?? survey.description}
        thankYouText={survey.thank_you_text}
        isAnonymous={survey.is_anonymous}
        fields={fields}
        actorName={isOnboarding || survey.is_anonymous ? null : actor?.name ?? null}
        needIdentity={isOnboarding || (!survey.is_anonymous && !actor)}
        cohort={searchParams?.cohort ?? null}
      />
    </main>
  );
}
