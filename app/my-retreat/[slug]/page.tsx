import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { companyOs } from "@/lib/supabase";
import { MY_RETREAT_COOKIE, verifyAccessGrant } from "@/lib/my-retreat/access";
import { getEventBySlug } from "@/lib/events-server";
import { getEventAgenda } from "@/lib/admin/event-agenda";
import { formatEventDates } from "@/lib/events";
import { RETREAT_SURVEYS, getRetreatResources } from "@/lib/my-retreat/content";
import { RetreatAgenda } from "@/components/retreat/RetreatAgenda";
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

export const dynamic = "force-dynamic";
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
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "clamp(104px, 14vh, 168px) 20px 96px" }}>
      <header style={{ marginBottom: 36, paddingBottom: 24, borderBottom: "1px solid color-mix(in srgb, var(--color-primary-dark) 8%, transparent)" }}>
        <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
          {firstName ? `Welcome, ${firstName}` : "My Retreat"}
        </div>
        <h1 style={{ fontSize: 32, margin: "8px 0 10px", lineHeight: 1.1, letterSpacing: "-0.01em" }}>{event.title}</h1>
        <div style={{ opacity: 0.75, fontSize: 16 }}>
          {formatEventDates(event.starts_at, event.ends_at, event.timezone)}
          {event.location ? ` · ${event.location}` : ""}
        </div>
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt={event.title}
            style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 14, marginTop: 18 }}
          />
        )}
      </header>

      {event.description && (
        <section style={{ marginBottom: 32, lineHeight: 1.6, fontSize: 17 }}>
          <p style={{ whiteSpace: "pre-line", margin: 0 }}>{event.description}</p>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 20, margin: "0 0 14px" }}>Your itinerary</h2>
        <RetreatAgenda blocks={blocks} view="guest" />
      </section>

      <SurveyCards items={surveyCards} />
      <ResourceCards resources={resources} />
    </main>
  );
}
