import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { MY_RETREAT_COOKIE, verifyAccessGrant } from "@/entities/retreats/my-retreat/access";
import { getEventBySlug } from "@/entities/retreats/events-server";
import { getEventAgenda } from "@/entities/company-os";
import { formatEventDates } from "@/entities/retreats/events";
import { RETREAT_SURVEYS, getRetreatResources } from "@/entities/retreats/my-retreat/content";
import { RetreatAgenda } from "@/entities/retreats/ui/retreat/RetreatAgenda";
import { SurveyCards, ResourceCards, type SurveyCard } from "./HubSections";

// Which of the standard surveys this guest has already answered for this
// retreat: a response tagged with the retreat's cohort_slug and matching the
// guest by person_id or email. Attendee sets are tiny, so one small read.
async function completedSurveySlugs(cohort: string, personId?: string, email?: string): Promise<Set<string>> {
  const or: string[] = [];
  if (personId) or.push(`person_id.eq.${personId}`);
  if (email) or.push(`respondent_email.ilike.${email}`);
  if (or.length === 0) return new Set();
  const { data } = await companyOs
    .from("survey_responses")
    .select("surveys(slug)")
    .eq("cohort_slug", cohort)
    .or(or.join(","));
  const slugs = new Set<string>();
  for (const r of (data ?? []) as { surveys: { slug: string } | { slug: string }[] | null }[]) {
    const s = Array.isArray(r.surveys) ? r.surveys[0]?.slug : r.surveys?.slug;
    if (s) slugs.add(s);
  }
  return slugs;
}

export const metadata: Metadata = { title: "My Retreat", robots: { index: false, follow: false } };

// The gated guest hub. Verifies the signed cookie matches this retreat, then
// renders the retreat basics (from the events row) and the guest itinerary
// (guest-visible agenda blocks). Staff assignments are stripped before render —
// the work-schedule half never reaches the guest.
export default async function MyRetreatHub({ params }: { params: { slug: string } }) {
  const token = cookies().get(MY_RETREAT_COOKIE)?.value;
  const grant = await verifyAccessGrant(token);
  if (!grant || grant.eventSlug !== params.slug) redirect("/my-retreat");

  const event = await getEventBySlug(params.slug);
  if (!event) redirect("/my-retreat");

  // Defense in depth: drop staff before the guest render.
  const blocks = (await getEventAgenda(event.id)).map((b) => ({ ...b, staff: [] }));

  const done = await completedSurveySlugs(event.slug, grant.personId, grant.email);
  const surveyCards: SurveyCard[] = RETREAT_SURVEYS.map((s) => ({
    stage: s.stage,
    title: s.title,
    description: s.description,
    href: `/surveys/${s.slug}?cohort=${encodeURIComponent(event.slug)}`,
    completed: done.has(s.slug),
  }));
  const resources = getRetreatResources(event.slug);

  const firstName = grant.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className="site-retreat-main">
      <header className="site-header-divider">
        <div className="site-eyebrow-dim">
          {firstName ? `Welcome, ${firstName}` : "My Retreat"}
        </div>
        <h1 className="site-h-32">{event.title}</h1>
        <div className="site-dim-16">
          {formatEventDates(event.starts_at, event.ends_at, event.timezone)}
          {event.location ? ` · ${event.location}` : ""}
        </div>
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="site-img-banner u-mt-4"
          />
        )}
      </header>

      {event.description && (
        <section className="site-body-17 u-mb-6">
          <p className="u-m-0 site-preline">{event.description}</p>
        </section>
      )}

      <section>
        <h2 className="site-h-20 u-m-0 u-mb-4">Your itinerary</h2>
        <RetreatAgenda blocks={blocks} view="guest" />
      </section>

      <SurveyCards items={surveyCards} />
      <ResourceCards resources={resources} />
    </main>
  );
}
