"use client";

import { useState, useTransition } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { ReactNode } from "react";
import { addTalkingPoint, noticeSomething, savePrivateProfile } from "@/entities/coaching/lib/actions";
import { type RenderedHtml, COACH_TABS, type CoachTab, validTab, type ActionResult } from "./coach-profile/shared";
import { GoalsCard } from "./coach-profile/GoalsCard";
import { PrioritiesCard } from "./coach-profile/PrioritiesCard";
import { CadenceCard } from "./coach-profile/CadenceCard";
import { OceanCard } from "./coach-profile/OceanCard";
import { TheirHowIWork } from "./coach-profile/TheirHowIWork";
import { NoticeSomething } from "./coach-profile/NoticeSomething";
import { FirstMeeting } from "./coach-profile/FirstMeeting";
import { profileIsBare } from "@/entities/coaching/lib/profile-bare";
import { OPEN_COMMITMENT_STATUSES, type CommitmentStatus } from "@/entities/coaching/lib/types";
import { UnaskedQuestion } from "./coach-profile/UnaskedQuestion";
import { TalkingPointsCard } from "./coach-profile/TalkingPointsCard";
import { CarriedOverCard } from "./coach-profile/CarriedOverCard";
import { CraftCard } from "./coach-profile/CraftCard";
import { CommitmentsCard } from "./coach-profile/CommitmentsCard";
import { MeetingsCard } from "./coach-profile/MeetingsCard";
import { PerformanceCard } from "./coach-profile/PerformanceCard";
import { TrendsCard } from "./coach-profile/TrendsCard";
import { CheckinsCard } from "./coach-profile/CheckinsCard";
import { CompanyGoalsCard } from "./coach-profile/CompanyGoalsCard";
import { NotesCard } from "./coach-profile/NotesCard";
export { type RenderedHtml } from "./coach-profile/shared";

export function CoachProfileView({
  detail,
  html,
  reviewCount,
  reviewHistory,
  initialTab,
  todayIso,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  // Performance-review cycles for this member (fetched in the page, not in the
  // coaching data layer, so lib/reviews' server deps never reach this bundle).
  // The table is team's component, rendered by the route and passed as a node.
  reviewCount: number;
  reviewHistory: ReactNode;
  initialTab?: string;
  todayIso: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [tab, setTab] = useState<CoachTab>(validTab(initialTab));

  const run = (label: string, fn: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(`${label}: ${res.error}`);
    });
  };

  // Tab lives in the URL (?tab=…) so links are shareable and refresh keeps the
  // place, without a server round-trip: the server reads the initial tab, and
  // switching only rewrites the query.
  const selectTab = (id: CoachTab) => {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id === "next") url.searchParams.delete("tab");
      else url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Everything this pair has said in past recaps, as one blob for the unasked
  // question to match against (L.12). The shared recap rather than the coach's
  // private half: a question is "covered" when the two of them talked about it.
  const saidBefore = detail.meetings
    .map((m) => m.sharedSummaryMarkdown ?? "")
    .join(" ");

  // Nothing between these two yet (L.13). Derived here as well as in the
  // header because both halves of the page answer the same question, and a
  // second derivation is cheaper than threading one through a server component
  // into a client one.
  const bare = profileIsBare({
    hasNextMeeting: detail.meetings.some((m) => m.status === "scheduled"),
    hasHeldMeeting: detail.meetings.some((m) => m.status === "held"),
    openCommitments: detail.commitments.filter((c) =>
      (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
    ).length,
    goals: detail.goals.length,
  });

  // The schedule form lives in the header, so the block's button sends the
  // coach to it rather than growing a second one.
  const scrollToSchedule = () => {
    document.querySelector(".admin-coach-hero__actionbtns")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const counts: Partial<Record<CoachTab, number>> = {
    log: detail.meetings.length,
    goals: detail.goals.filter((g) => g.status === "active").length,
    performance: reviewCount,
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {busy && <div className="admin-hint">Working… AI steps can take a minute.</div>}

      <nav className="admin-tabs coach-tabs" role="tablist" aria-label="Coaching sections">
        {COACH_TABS.map((t) => {
          const active = tab === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`admin-tab${active ? " is-active" : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
              {typeof count === "number" && count > 0 && <span className="admin-coach-tab-count">{count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="admin-coach-profile">
        {tab === "next" && (
          <>
            {/* The first visit is a different page, not an emptier one (L.13,
                mirroring K.27 on the member's side). Talking points and an
                empty Next 1-1 card tell a coach nothing they can act on when
                the two of them have never met. */}
            {bare ? (
              <FirstMeeting name={detail.member.name} onSchedule={scrollToSchedule} />
            ) : (
              <>
            <CarriedOverCard detail={detail} todayIso={todayIso} />
            <TalkingPointsCard detail={detail} run={run} busy={busy} />
            <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="next" />
            <CommitmentsCard detail={detail} run={run} busy={busy} />
            <PrioritiesCard detail={detail} run={run} busy={busy} />
            {/* Last, and deliberately quiet: the craft diagnostics are context
                a coach glances at while preparing, not the agenda (K.47). */}
            <CraftCard detail={detail} />
            {/* The only thing on this tab addressed to the coach (L.12). At the
                foot, because it is a prompt and not the agenda. */}
            <UnaskedQuestion
              saidBefore={saidBefore}
              busy={busy}
              onAdd={(q) => run("Talking point", () => addTalkingPoint(detail.profileId, q))}
            />
              </>
            )}
          </>
        )}

        {tab === "log" && <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="log" />}

        {tab === "goals" && (
          <>
            <GoalsCard detail={detail} run={run} busy={busy} />
            <CompanyGoalsCard detail={detail} />
          </>
        )}

        {tab === "person" && (
          <>
            {/* The member's own account first, then the coach's read of them
                (L.3). This order is the argument: how they say they work is
                what a coach adapts to, and the OCEAN read is the coach's
                interpretation beside it rather than the headline above it. */}
            <TheirHowIWork facts={detail.howIWork} name={detail.member.name} />
            {/* Noticing something (L.4). On the person tab rather than the
                agenda, because it is not a thing to raise in the 1-1 — it is a
                sentence that lands on their own page whenever you write it. */}
            <section className="admin-card admin-coach-section">
              <div className="admin-card-title">Noticed</div>
              <div className="admin-hint">
                One sentence about a specific piece of work, tied to a value. Only {detail.member.name} sees it, and it
                is never counted, listed across people or compared with anybody.
              </div>
              <NoticeSomething
                values={detail.noticeableValues}
                busy={busy}
                onWrite={(input) => run("Noticed", () => noticeSomething(detail.profileId, input))}
              />
              {detail.noticed.length > 0 && (
                <div className="admin-coach-ocean-list">
                  {detail.noticed.map((n) => (
                    <div key={n.id} className="coach-block">
                      <span className="admin-eyebrow">
                        {n.noticedOn}
                        {n.valueTitle ? ` · ${n.valueTitle}` : ""}
                      </span>
                      <p>{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <OceanCard detail={detail} run={run} busy={busy} />
            <NotesCard
              title="Private coaching notes"
              hint="How they're wired plus the retention read. Only you see this. It feeds the AI prep."
              initial={detail.privateProfileMarkdown ?? ""}
              rendered={html.privateProfile}
              onSave={(md) => run("Private notes", () => savePrivateProfile(detail.profileId, md))}
              busy={busy}
            />
            <CadenceCard detail={detail} run={run} busy={busy} />
          </>
        )}

        {tab === "performance" && <PerformanceCard memberName={detail.member.name} reviewCount={reviewCount} history={reviewHistory} />}

        {tab === "insights" && (
          <>
            <TrendsCard detail={detail} html={html} run={run} busy={busy} />
            <CheckinsCard detail={detail} html={html} />
          </>
        )}
      </div>
    </div>
  );
}
