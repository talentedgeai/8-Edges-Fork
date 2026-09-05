import { NextRequest, NextResponse } from "next/server";
import { companyOs } from "@/kernel/data/supabase";
import { getOrCreatePerson } from "@/kernel/data/company-os";
import { resolveSurveyActor, classifyEmail, type RespondentKind } from "@/entities/portal/lib/survey-identity";
import { notifyOps } from "@/kernel/messaging/lark";
import { validateAnswer, type SurveyFieldRow } from "@/entities/company-os";
import { processOnboardingSubmission } from "@/entities/team";
import { recordDay8Response } from "@/entities/team";
import { backfillCompanyIndustry, isAiJourneyPurpose, resolveCompanyPrefill } from "@/entities/assistant";
import { applyReviewSubmission, getReviewRunContext, visibleReviewFields } from "@/entities/team";

// Public survey submission. Unauthenticated by design; the server re-validates
// every answer against the question set and resolves identity itself — the
// client's name/email are only used for external respondents. Anonymous
// surveys never store person_id / name / email, only the team-vs-external kind.

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const body = await req.json();

    // Honeypot: bots fill the hidden field; pretend success.
    if (body.website) return NextResponse.json({ ok: true });

    const { data: surveyData } = await companyOs
      .from("surveys")
      .select("id, name, status, is_anonymous, archived_at, purpose")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!surveyData || surveyData.archived_at)
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    if (surveyData.status !== "published")
      return NextResponse.json({ error: "This survey is not accepting responses." }, { status: 410 });

    const { data: fieldsData, error: fieldsErr } = await companyOs
      .from("survey_fields")
      .select("id, survey_id, position, type, label, help_text, required, config")
      .eq("survey_id", surveyData.id)
      .order("position", { ascending: true });
    if (fieldsErr) return NextResponse.json({ error: "Could not load the survey." }, { status: 500 });
    const fields = (fieldsData ?? []) as SurveyFieldRow[];
    if (fields.length === 0)
      return NextResponse.json({ error: "This survey has no questions." }, { status: 410 });

    // Performance reviews: authorized rater only, answers land on the review
    // row (never in survey_responses, so review content stays out of every
    // survey surface), and no ops notification (HR content is private).
    if (surveyData.purpose === "performance_review") {
      const reviewId = typeof body.review === "string" ? body.review.trim() : "";
      const ctx = await getReviewRunContext(reviewId, params.slug);
      if (ctx === null)
        return NextResponse.json({ error: "Sign in to the team portal to submit this review." }, { status: 401 });
      if (ctx === "closed")
        return NextResponse.json({ error: "This review was already submitted." }, { status: 409 });

      // Validate only the fields this cycle shows — the manager form's hidden
      // decision fields (wrong type) must not count as missing-required.
      const reviewFields = visibleReviewFields(fields, ctx.review.review_type);
      const rawReviewAnswers = (body.answers ?? {}) as Record<string, unknown>;
      const validated = new Map<string, { value: string; value_json: unknown }>();
      for (const field of reviewFields) {
        const v = validateAnswer(field, rawReviewAnswers[field.id]);
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
        if (v.skip) continue;
        validated.set(field.id, { value: v.text, value_json: v.json });
      }
      if (validated.size === 0)
        return NextResponse.json({ error: "The response is empty." }, { status: 400 });

      const applied = await applyReviewSubmission(ctx.review, reviewFields, validated);
      if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    // Identity. Onboarding is for a new hire not in the system, so we must
    // resolve them by the email they TYPE, never by a logged-in session (a
    // recruiter previewing the link would otherwise get mapped as the person).
    const isOnboarding = surveyData.purpose === "onboarding";
    const actor = isOnboarding ? null : await resolveSurveyActor();

    // AI Journey: the page hides questions whose config.maps_to value the CRM
    // already knows for a logged-in respondent. Inject those values here so the
    // stored response is complete and required-field validation still holds.
    const rawAnswers = (body.answers ?? {}) as Record<string, unknown>;
    if (isAiJourneyPurpose(surveyData.purpose) && !surveyData.is_anonymous && actor?.personId) {
      const prefill = await resolveCompanyPrefill(actor.personId);
      for (const field of fields) {
        const mapsTo = field.config?.maps_to;
        const raw = rawAnswers[field.id];
        const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
        if (mapsTo && prefill[mapsTo] !== undefined && empty) rawAnswers[field.id] = prefill[mapsTo];
      }
    }

    // Validate every answer server-side.
    const answerRows: { field_id: string; value: string; value_json: unknown }[] = [];
    for (const field of fields) {
      const v = validateAnswer(field, rawAnswers[field.id]);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      if (v.skip) continue;
      answerRows.push({ field_id: field.id, value: v.text, value_json: v.json });
    }
    if (answerRows.length === 0)
      return NextResponse.json({ error: "The response is empty." }, { status: 400 });

    let personId: string | null = null;
    let respondentName: string | null = null;
    let respondentEmail: string | null = null;
    // team = staff/admin, client = person already on file, external = only
    // known from a survey. A logged-in portal client is identified (person_id,
    // name, email from the session) and stamped "client".
    let kind: RespondentKind;

    if (surveyData.is_anonymous) {
      kind = actor?.kind ?? "external";
    } else if (actor) {
      kind = actor.kind;
      personId = actor.personId;
      respondentName = actor.name;
      respondentEmail = actor.email;
    } else {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!name || !email.includes("@"))
        return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
      respondentName = name;
      respondentEmail = email;
      // Classify the typed email BEFORE getOrCreatePerson mints a record — a
      // brand-new respondent must resolve to "external", not "client".
      kind = await classifyEmail(email);
      const person = await getOrCreatePerson({ email, name, source: "survey" });
      if (person.ok) personId = person.id;
    }

    // Event attribution: ?cohort=<event-slug> arrives via an event's feedback
    // QR. Only stamped when it matches a real event, so junk query params
    // can't pollute the column (which trend reporting groups by).
    let cohortSlug: string | null = null;
    const cohortRaw = typeof body.cohort === "string" ? body.cohort.trim().slice(0, 120) : "";
    if (cohortRaw) {
      const { data: eventRow } = await companyOs
        .from("events")
        .select("slug")
        .eq("slug", cohortRaw)
        .maybeSingle();
      cohortSlug = eventRow?.slug ?? null;
    }

    const { data: response, error: rErr } = await companyOs
      .from("survey_responses")
      .insert({
        survey_id: surveyData.id,
        respondent_kind: kind,
        person_id: personId,
        respondent_name: respondentName,
        respondent_email: respondentEmail,
        ...(cohortSlug ? { cohort_slug: cohortSlug } : {}),
      })
      .select("id")
      .single();
    if (rErr || !response)
      return NextResponse.json({ error: "Could not save your response." }, { status: 500 });

    const { error: aErr } = await companyOs
      .from("survey_answers")
      .insert(answerRows.map((a) => ({ ...a, response_id: response.id })));
    if (aErr) {
      // Don't leave a half-saved response behind.
      await companyOs.from("survey_responses").delete().eq("id", response.id);
      console.error("survey answers insert failed:", aErr.message);
      return NextResponse.json({ error: "Could not save your response." }, { status: 500 });
    }

    const who = surveyData.is_anonymous
      ? `anonymous (${kind})`
      : `${respondentName ?? "Unknown"}${respondentEmail ? ` <${respondentEmail}>` : ""} (${kind})`;
    void notifyOps(`📋 Survey response — ${surveyData.name}\n${who} · ${answerRows.length} answers`);

    // Purpose-driven post-processing. Onboarding maps the answers into the CRM,
    // moves the person to pre-boarding, and provisions the portal account. Runs
    // after the response is safely saved; a failure here never fails the submit.
    if (surveyData.purpose === "onboarding" && personId) {
      const answers = new Map(
        answerRows.map((a) => [a.field_id, (a.value_json ?? a.value) as string | string[] | number | boolean | null]),
      );
      try {
        await processOnboardingSubmission({
          personId,
          email: respondentEmail ?? "",
          name: respondentName,
          fields,
          answers,
        });
      } catch (err) {
        console.error("[survey] onboarding post-process failed:", err);
      }
    }

    // AI Journey pre-survey: adopt the respondent's industry answer when their
    // company has none on file. Same contract: never fails the submit.
    if (surveyData.purpose === "ai_journey_pre" && personId) {
      try {
        await backfillCompanyIndustry(personId, fields, answerRows);
      } catch (err) {
        console.error("[survey] ai-journey post-process failed:", err);
      }
    }

    // Onboarding-cycle hooks. Same contract as the onboarding processor: they
    // run after the response is safely saved and never fail the submit.
    if (surveyData.purpose === "onboarding_day8" && personId) {
      try {
        await recordDay8Response(personId, response.id);
      } catch (err) {
        console.error("[survey] day8 post-process failed:", err);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Survey submit error:", err);
    return NextResponse.json({ error: "Failed to submit." }, { status: 500 });
  }
}
