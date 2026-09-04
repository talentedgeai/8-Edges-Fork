import { requireTeamMember } from "@/lib/team-auth";
import { getOwnProfile, getOpenRoles, teamRead } from "@/lib/team/data";
import { getClientRoadmapSnippets } from "@/lib/team/clients";
import { getMyRecentTasks } from "@/lib/team/boards";
import {
  PRIORITY_LABEL as TASK_PRIORITY_LABEL,
  PRIORITY_TONE as TASK_PRIORITY_TONE,
} from "@/lib/boards/types";
import { PageHead } from "@/components/admin/PageHead";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { PRIORITY_LABEL, type BacklogPriority } from "@/lib/client-backlog";
import { formatDate, humanize } from "@/lib/admin/format";

const PRIORITY_TONE: Record<BacklogPriority, BadgeTone> = {
  now: "info",
  next: "ok",
  later: "neutral",
  park: "warn",
};
import { OnboardingWalkthrough } from "@/components/team/OnboardingWalkthrough";
import { TeamCollage } from "@/components/team/TeamCollage";
import { StartHerePanel, bucketForRole } from "@/components/team/StartHerePanel";
import { randomGalleryPhotos, collageAvatars } from "@/lib/gallery";
import { getAllPublishedPosts } from "@/lib/blog";
import { setOnboardingDone } from "./actions";
import Link from "next/link";

// The core teaching every new hire reads first; the rest of the "Start here"
// panel is the newest posts by date.
const CORE_TEACHING_SLUG = "the-other-50-percent-of-leadership";

// People allowed to preview the first-use "Start here" panel after they are
// confirmed (for review/demo). Keyed on the stable person_id like the rest of
// /team, never on email (see lib/team-auth's identity model).
const START_HERE_PREVIEW_PERSON_IDS = new Set<string>([
  "a8bf026f-8c20-49c5-8a55-6fc5c580af64", // Dave Hajdu (dave@edge8.ai)
]);

export const dynamic = "force-dynamic";

// Portal home. Everything here is self-scoped: the profile is fetched by the
// actor's own team_member id, and "next time off" is filtered to the actor.
type NextLeave = { start_date: string; end_date: string; leave_type: string; status: string };

// The full employee workspace, designed end-state-first: every touchpoint an
// employee will eventually reach lives here from day one. Shipped slices are
// cards in HUB_LIVE; unshipped ones sit in HUB_SOON as a quiet pill row. Ship
// an item by moving it to HUB_LIVE with its route as `href`.
type HubItem = { title: string; sub: string; ico: string; href?: string };

const HUB_LIVE: HubItem[] = [
  {
    title: "Time Off",
    sub: "Request leave and track what's approved.",
    ico: "☼",
    href: "/team/time-off",
  },
  {
    title: "My Profile",
    sub: "Your details, role, and emergency contact.",
    ico: "☺",
    href: "/team/profile",
  },
  {
    title: "My Equipment",
    sub: "The laptop and kit you're holding, and how to ask for more.",
    ico: "▤",
    href: "/team/equipment",
  },
  {
    title: "Team Directory",
    sub: "Find anyone at Edge8 and who they report to.",
    ico: "☷",
    href: "/team/directory",
  },
  {
    title: "Org Chart",
    sub: "How Edge8 fits together — who reports to whom, at a glance.",
    ico: "⌥",
    href: "/team/org",
  },
  {
    title: "Ideas that Spark Solutions",
    sub: "What should we build? What have I learned? Share both with the team.",
    ico: "✦",
    href: "/team/ideas",
  },
];

const HUB_SOON: HubItem[] = [
  { title: "Company Announcements", sub: "What's happening across Edge8, in one feed.", ico: "◈" },
  { title: "HR Handbook", sub: "Policies, ways of working, and how we do things.", ico: "▤" },
  { title: "Health Insurance", sub: "Your coverage and how to make a claim.", ico: "♥" },
  { title: "1-1 Schedule", sub: "Your biweekly time with your manager, prepped and tracked.", ico: "◷" },
  { title: "Pulse Survey", sub: "A quick read on how the team is feeling.", ico: "▲" },
  { title: "Feedback", sub: "Give feedback and ask for it, any time.", ico: "✎" },
];

function HubCard({ item }: { item: HubItem }) {
  if (!item.href) return null;
  return (
    <Link href={item.href} className="admin-hub-card">
      <span className="admin-hub-ico" aria-hidden>
        {item.ico}
      </span>
      <span className="admin-hub-title">{item.title}</span>
      <span className="admin-hub-sub">{item.sub}</span>
    </Link>
  );
}

export default async function TeamHome() {
  const actor = await requireTeamMember();
  const today = new Date().toISOString().slice(0, 10);
  // These six reads are all independent (they depend only on `actor`), so fire
  // them together instead of stacking ~8 serial round trips on the one page
  // staff open every morning on a phone. Exactly four photos and four faces are
  // drawn fresh on every load, a fixed composition with rotating content.
  const [profile, clientSnippets, recentTasks, openRoles, [collagePhotos, collagePeople], leaveRes] =
    await Promise.all([
      getOwnProfile(actor),
      getClientRoadmapSnippets(actor, 3),
      getMyRecentTasks(actor, 3),
      getOpenRoles(),
      Promise.all([randomGalleryPhotos(4), collageAvatars(4)]),
      teamRead(actor, "time_off", "start_date, end_date, leave_type, status")
        .eq("team_member_id", actor.teamMemberId)
        .gte("end_date", today)
        .in("status", ["requested", "approved"])
        .order("start_date", { ascending: true })
        .limit(1),
    ]);
  // Reqs this person is the hiring manager for. Nothing renders unless they
  // own one, so the section is invisible to everyone who is not hiring.
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

  // The "Start here" panel is a first-use state, not a separate page: shown
  // while the actor is in pre-boarding or probation (employment_stage), then it
  // drops away once they are confirmed.
  const isFirstUse =
    profile?.employmentStage === "pre_boarding" ||
    profile?.employmentStage === "probation" ||
    START_HERE_PREVIEW_PERSON_IDS.has(actor.personId);
  const blogPosts = await getAllPublishedPosts();
  const coreTeaching = blogPosts.find((p) => p.slug === CORE_TEACHING_SLUG) ?? null;
  const recentPosts = blogPosts
    .filter((p) => p.slug !== CORE_TEACHING_SLUG)
    .slice(0, 3);
  const roleBucket = bucketForRole(
    profile?.positionTitle ?? null,
    profile?.departmentName ?? null,
  );

  return (
    <>
      <PageHead eyebrow={dateLine} title={`${greeting}, ${actor.displayName}`} sub={heroSub} />

      {/* People first: the band of faces and moments sits directly under the
          greeting, then the personal facts, then the tools. */}
      <TeamCollage photos={collagePhotos} avatars={collagePeople} />

      <div className="admin-glance">
        <div className="admin-glance-cell">
          <span className="admin-glance-label">Next time off</span>
          <span className="admin-glance-value">{nextLeave ? formatDate(nextLeave.start_date) : "None scheduled"}</span>
          <span className="admin-glance-note">
            {nextLeave ? (
              `${humanize(nextLeave.leave_type)} · ${nextLeave.status}`
            ) : (
              <Link href="/team/time-off">Request time off →</Link>
            )}
          </span>
        </div>
        <div className="admin-team-glance-cell">
          <span className="admin-team-glance-label">Manager</span>
          <span className="admin-team-glance-value">{profile?.managerName || "—"}</span>
        </div>
        <div className="admin-team-glance-cell">
          <span className="admin-team-glance-label site-brand-label">With Edge8 since</span>
          <span className="admin-team-glance-value">{profile?.start_date ? formatDate(profile.start_date) : "—"}</span>
        </div>
      </div>

      {(clientSnippets.length > 0 || recentTasks.length > 0) && (
        <div className="admin-team-home-cols">
          {clientSnippets.length > 0 && (
            <div>
              <h2 className="admin-section-label">Your clients</h2>
              {clientSnippets.map((s) => (
                <div key={s.company.id} className="admin-card admin-section-card u-mb-4">
                  <div className="u-row u-between u-mb-3">
                    <h3 className="admin-card-title">
                      {s.company.name}
                      <span className="admin-cell-muted u-ml-2 u-sm">
                        roadmap · next up
                      </span>
                    </h3>
                    <Link href={`/team/clients/${s.company.id}`} className="admin-cell-muted u-sm">
                      View all {s.total} →
                    </Link>
                  </div>
                  <div className="admin-list">
                    {s.items.map((it) => (
                      <Link
                        key={it.id}
                        href={`/team/clients/${s.company.id}`}
                        className="admin-list-row u-link-plain"
                      >
                        <div className="admin-list-main">
                          <div className="admin-list-title">
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
          )}
          {recentTasks.length > 0 && (
            <div>
              <h2 className="admin-section-label">Recent tasks</h2>
              <div className="admin-card admin-section-card u-mb-4">
                <div className="u-row u-between u-mb-3">
                  <h3 className="admin-card-title">
                    Assigned to you
                    <span className="admin-cell-muted u-ml-2 u-sm">
                      newest first
                    </span>
                  </h3>
                  <Link href="/team/my-work-boards" className="admin-cell-muted u-sm">
                    All my tasks →
                  </Link>
                </div>
                <div className="admin-list">
                  {recentTasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/team/boards/${t.boardSlug}`}
                      className="admin-list-row u-link-plain"
                    >
                      <div className="admin-list-main">
                        <div className="admin-list-title">{t.title}</div>
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
            </div>
          )}
        </div>
      )}

      {myOpenRoles.length > 0 && (
        <>
          <h2 className="admin-section-label">You&rsquo;re hiring</h2>
          <div className="admin-card admin-section-card u-mb-4">
            <div className="admin-list">
              {myOpenRoles.map((r) => (
                <div key={r.id} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{r.title}</div>
                    <div className="admin-cell-muted u-sm">
                      {r.location || "Location not set"}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    {r.isPublic && r.slug ? (
                      <a href={`/careers/${r.slug}/`} target="_blank" rel="noreferrer">
                        View posting →
                      </a>
                    ) : (
                      <Badge tone="warn">Not published</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <h2 className="admin-section-label">Your workspace</h2>
      <div className="admin-hub-grid admin-hub-grid--row">
        {HUB_LIVE.map((item) => (
          <HubCard key={item.title} item={item} />
        ))}
      </div>

      <a
        href="https://aiolabz.com"
        target="_blank"
        rel="noopener noreferrer"
        className="admin-card admin-section-card u-row u-gap-4 u-mt-4 u-link-plain"
      >
        <div className="u-grow u-min-0">
          <h2 className="admin-card-title u-mb-1">Get Certified</h2>
          <p className="admin-page-sub u-m-0">
            Become a certified AI Officer on AIOlabz. Sign up with your <b>@edge8.ai</b> email and
            work through the challenge-based program.
          </p>
        </div>
        <span className="admin-btn admin-btn--primary" style={{ flex: "none", pointerEvents: "none" }}>
          Start on AIOlabz →
        </span>
      </a>

      {isFirstUse && coreTeaching && (
        <StartHerePanel
          coreTeaching={coreTeaching}
          recentPosts={recentPosts}
          roleBucket={roleBucket}
        />
      )}

      {/* Coming features state the ambition without competing with the live
          tools: one quiet row of pills instead of a second card grid. */}
      <h2 className="admin-section-label">On the way</h2>
      <div className="admin-team-soon-row">
        {HUB_SOON.map((item) => (
          <span key={item.title} className="admin-team-soon-pill" title={item.sub}>
            <span aria-hidden>{item.ico}</span> {item.title}
          </span>
        ))}
      </div>

      <OnboardingWalkthrough
        name={actor.displayName.split(/\s+/)[0]}
        startOpen={!onboardingDone}
        onFinish={setOnboardingDone}
      />
    </>
  );
}
