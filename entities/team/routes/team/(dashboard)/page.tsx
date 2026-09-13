import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getOwnProfile, getOpenRoles, teamRead } from "@/entities/team/lib/data";
import { getClientRoadmapSnippets } from "@/entities/team/lib/hub-clients";
import { getMyRecentTasks } from "@/entities/team/lib/boards";
import { getMyGoals, getMyCoaching } from "@/entities/coaching";
import { readCertifications } from "@/entities/team/lib/certifications";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { PRIORITY_LABEL, type BacklogPriority } from "@/entities/client-programs";
import { formatDate, humanize } from "@/kernel/ui/format";
import { OnboardingWalkthrough } from "@/entities/team/ui/OnboardingWalkthrough";
import { TeamCollage } from "@/entities/team/ui/TeamCollage";
import { StartHerePanel, bucketForRole } from "@/entities/team/ui/StartHerePanel";
import { HomePerformance, type HomeGoal } from "@/entities/team/ui/HomePerformance";
import { HomeCertifications } from "@/entities/team/ui/HomeCertifications";
import { randomGalleryPhotos, collageAvatars } from "@/entities/site";
import { getAllPublishedPosts } from "@/entities/campaigns";
import { setOnboardingDone } from "./actions";
import Link from "next/link";
import { PRIORITY_TONE as TASK_PRIORITY_TONE } from "@/entities/boards";
import { PRIORITY_LABEL as TASK_PRIORITY_LABEL } from "@/entities/boards";

const PRIORITY_TONE: Record<BacklogPriority, BadgeTone> = {
  now: "info",
  next: "ok",
  later: "neutral",
  park: "warn",
};

// The core teaching every new hire reads first; the rest of the "Start here"
// panel is the newest posts by date.
const CORE_TEACHING_SLUG = "the-other-50-percent-of-leadership";

// A new hire's first 30 days lead with onboarding; after that the workboard
// leads. Kept as a constant so the two thresholds (the priority switch and the
// "day N of your first 30" label) stay in step.
const NEW_HIRE_DAYS = 30;

// Portal home. Everything here is self-scoped: the profile is fetched by the
// actor's own team_member id, and "next time off" is filtered to the actor.
type NextLeave = { start_date: string; end_date: string; leave_type: string; status: string };

// The employee home is composed like the client view: a full-width hero and
// photo band, then a 2:1 grid. The wide main column carries the dense content
// (a new hire's onboarding first, then My tasks and the clients as a uniform
// two-up); the narrow rail carries the compact cards (FAST Goals, Get
// certified, hiring, the workspace links) so sparse content never stretches
// across the page. Every section label sits outside its card.
type HubItem = { title: string; href: string };

const HUB_LIVE: HubItem[] = [
  { title: "Time off", href: "/team/time-off" },
  { title: "My profile", href: "/team/profile" },
  { title: "My equipment", href: "/team/equipment" },
  { title: "Team directory", href: "/team/directory" },
  { title: "Org chart", href: "/team/org" },
  { title: "Ideas that spark solutions", href: "/team/ideas" },
];

// Items per client card on the home. Fixed, with one-line titles, so every
// card in the two-up is the same height and the grid stays aligned.
const CLIENT_ITEMS = 2;

// A FAST Goal's percentage, from the measured start/current/target when set.
function goalPct(start: number | null, current: number | null, target: number | null): number | null {
  if (start === null || current === null || target === null || target === start) return null;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function firstLine(md: string | null): string | null {
  const line = (md ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  return line ? line.replace(/^[#>*\-\s]+/, "").slice(0, 140) : null;
}

export default async function TeamHome() {
  const actor = await requireTeamMember();
  const today = new Date().toISOString().slice(0, 10);
  const [profile, clientSnippets, recentTasks, openRoles, [collagePhotos, collagePeople], leaveRes, goals, coaching] =
    await Promise.all([
      getOwnProfile(actor),
      getClientRoadmapSnippets(actor, CLIENT_ITEMS),
      getMyRecentTasks(actor, 3),
      getOpenRoles(),
      Promise.all([randomGalleryPhotos(4), collageAvatars(4)]),
      teamRead(actor, "time_off", "start_date, end_date, leave_type, status")
        .eq("team_member_id", actor.teamMemberId)
        .gte("end_date", today)
        .in("status", ["requested", "approved"])
        .order("start_date", { ascending: true })
        .limit(1),
      getMyGoals(actor),
      getMyCoaching(actor),
    ]);
  const myOpenRoles = openRoles.filter((r) => r.hiringManagerPersonId === actor.personId);
  const nextLeave = ((leaveRes.data ?? []) as unknown as NextLeave[])[0] ?? null;

  // The company runs on Saigon time; server renders in UTC, so pin the zone
  // rather than showing the wrong day to everyone at 6am.
  const now = new Date();
  const dateLine = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "numeric", hour12: false }).format(now),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const heroSub =
    [profile?.departmentName, profile?.positionTitle].filter(Boolean).join(" · ") ||
    (actor.role === "manager" ? "Manager workspace" : "Team workspace");

  const onboardingDone = Boolean(
    (profile?.person?.metadata as Record<string, unknown> | null)?.onboarding_completed_at,
  );

  // Days since the start date; a new hire's first 30 days lead with onboarding.
  // Pre-boarding or probation counts as a new hire even without a start date.
  const daysSinceStart = profile?.start_date
    ? Math.floor((Date.now() - Date.parse(profile.start_date)) / 86_400_000)
    : null;
  const inProbation = profile?.employmentStage === "pre_boarding" || profile?.employmentStage === "probation";
  const newHire = (daysSinceStart !== null && daysSinceStart >= 0 && daysSinceStart < NEW_HIRE_DAYS) || inProbation;
  const dayLabel =
    daysSinceStart === null ? "Welcome" : daysSinceStart < 0 ? "Starting soon" : `Day ${daysSinceStart + 1} of your first ${NEW_HIRE_DAYS}`;

  // Onboarding content (required reading, tool kit, certification CTA).
  const blogPosts = await getAllPublishedPosts();
  const coreTeaching = blogPosts.find((p) => p.slug === CORE_TEACHING_SLUG) ?? null;
  const recentPosts = blogPosts.filter((p) => p.slug !== CORE_TEACHING_SLUG).slice(0, 3);
  const roleBucket = bucketForRole(profile?.positionTitle ?? null, profile?.departmentName ?? null);

  // Performance: FAST Goals with progress, and the 1-1 rhythm.
  const homeGoals: HomeGoal[] = goals.map((g) => {
    const pct = goalPct(g.startValue, g.currentValue, g.targetValue);
    const measure =
      g.currentValue !== null && g.targetValue !== null
        ? `now ${g.currentValue}${g.metricUnit ? ` ${g.metricUnit}` : ""} · target ${g.targetValue}${g.metricUnit ? ` ${g.metricUnit}` : ""}`
        : null;
    return { id: g.id, title: g.title, pct, measure, status: humanize(g.status) };
  });
  const latestRecap = coaching?.recaps?.[0]
    ? { heldOn: coaching.recaps[0].heldOn, summary: firstLine(coaching.recaps[0].sharedSummaryMarkdown) }
    : null;

  // Certification progress on the two certification tracks.
  const certTracks = readCertifications(profile?.person?.metadata);

  // ── Main column ─────────────────────────────────────────────────────────
  const onboardingSection =
    newHire && coreTeaching ? (
      <>
        <div className="admin-hub-band-head">
          <h2 className="admin-card-title">Get started</h2>
          <span className="admin-cell-muted u-sm">{dayLabel}</span>
        </div>
        <StartHerePanel coreTeaching={coreTeaching} recentPosts={recentPosts} roleBucket={roleBucket} />
      </>
    ) : null;

  const tasksCard =
    recentTasks.length > 0 ? (
      <div className="admin-card admin-section-card u-mb-4">
        <div className="admin-card-head">
          <h3 className="admin-card-title">My tasks</h3>
          <Link href="/team/workboard" className="admin-cell-muted u-sm">All my tasks →</Link>
        </div>
        <div className="admin-list">
          {recentTasks.map((t) => (
            <Link key={t.id} href={`/team/boards/${t.boardSlug}`} className="admin-list-row u-link-plain">
              <div className="admin-list-main u-min-0">
                <div className="admin-list-title u-truncate">{t.title}</div>
                <div className="admin-cell-muted u-sm">
                  {t.boardName}
                  {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={TASK_PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    ) : null;

  // Uniform two-up: a fixed item count with one-line titles keeps every card
  // the same height, so the grid stays aligned whatever the roadmaps hold.
  const clientsGrid =
    clientSnippets.length > 0 ? (
      <>
        <div className="admin-hub-band-head">
          <h2 className="admin-card-title">Clients</h2>
          <Link href="/team/clients" className="admin-cell-muted u-sm">All →</Link>
        </div>
        <div className="admin-home-client-grid u-mb-4">
        {clientSnippets.map((s) => (
          <div key={s.company.id} className="admin-card admin-section-card">
            <div className="admin-card-head">
              <h3 className="admin-card-title u-truncate">{s.company.name}</h3>
              <Link href={`/team/clients/${s.company.id}`} className="admin-cell-muted u-sm u-shrink-none">All {s.total} →</Link>
            </div>
            <div className="admin-list">
              {s.items.slice(0, CLIENT_ITEMS).map((it) => (
                <Link key={it.id} href={`/team/clients/${s.company.id}`} className="admin-list-row u-link-plain">
                  <div className="admin-list-main u-min-0">
                    <div className="admin-list-title u-truncate">
                      {it.ref ? `${it.ref} · ` : ""}
                      {it.title}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABEL[it.priority]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      </>
    ) : null;

  const workSection =
    tasksCard || clientsGrid ? (
      <>
        <div className="admin-hub-band-head">
          <h2 className="admin-card-title">Work</h2>
        </div>
        {tasksCard}
        {clientsGrid}
      </>
    ) : null;

  // ── Rail ────────────────────────────────────────────────────────────────
  const hiringSection =
    myOpenRoles.length > 0 ? (
      <>
        <div className="admin-hub-band-head">
          <h2 className="admin-card-title">You&rsquo;re hiring</h2>
        </div>
        <div className="admin-card admin-section-card u-mb-4">
          <div className="admin-list">
            {myOpenRoles.map((r) => (
              <div key={r.id} className="admin-list-row">
                <div className="admin-list-main u-min-0">
                  <div className="admin-list-title u-truncate">{r.title}</div>
                  <div className="admin-cell-muted u-sm">{r.location || "Location not set"}</div>
                </div>
                <div className="admin-list-aside">
                  {r.isPublic && r.slug ? (
                    <a href={`/careers/${r.slug}/`} target="_blank" rel="noreferrer" className="u-sm">Posting →</a>
                  ) : (
                    <Badge tone="warn">Not published</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    ) : null;

  const workspaceSection = (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Workspace</h2>
      </div>
      <div className="admin-card admin-section-card u-mb-4">
        <div className="admin-list">
          {HUB_LIVE.map((item) => (
            <Link key={item.href} href={item.href} className="admin-list-row u-link-plain">
              <div className="admin-list-main">
                <div className="admin-list-title">{item.title}</div>
              </div>
              <div className="admin-list-aside admin-cell-muted">→</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <>
      <PageHead eyebrow={dateLine} title={`${greeting}, ${actor.displayName}`} sub={heroSub} />

      <TeamCollage photos={collagePhotos} avatars={collagePeople} />

      <p className="admin-page-sub u-mt-0 u-mb-5">
        Next time off: {nextLeave ? formatDate(nextLeave.start_date) : "none scheduled"}
        {" · "}
        <Link href="/team/time-off">Time off →</Link>
      </p>

      <div className="u-grid-2-1">
        <div>
          {onboardingSection}
          {workSection}
        </div>
        <div>
          <HomePerformance goals={homeGoals} latest={latestRecap} nextOn={coaching?.nextOneOnOneOn ?? null} hasCoaching={coaching !== null} />
          <HomeCertifications tracks={certTracks} />
          {hiringSection}
          {workspaceSection}
        </div>
      </div>

      {/* The welcome tour is a new-hire aid; established staff never see it or
          its replay trigger. */}
      {newHire && (
        <OnboardingWalkthrough
          name={actor.displayName.split(/\s+/)[0]}
          startOpen={!onboardingDone}
          onFinish={setOnboardingDone}
        />
      )}
    </>
  );
}
