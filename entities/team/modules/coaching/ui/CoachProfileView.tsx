"use client";

import { useState, useTransition } from "react";
import type { CoachProfileDetail } from "../data/profile";
import type { MemberReviewCycle } from "@/entities/team/lib/reviews-labels";
import { savePrivateProfile } from "@/entities/team/routes/(dashboard)/coaching/actions";
import { type RenderedHtml, COACH_TABS, type CoachTab, validTab, type ActionResult } from "./coach-profile/shared";
import { GoalsCard } from "./coach-profile/GoalsCard";
import { PrioritiesCard } from "./coach-profile/PrioritiesCard";
import { CadenceCard } from "./coach-profile/CadenceCard";
import { OceanCard } from "./coach-profile/OceanCard";
import { TalkingPointsCard } from "./coach-profile/TalkingPointsCard";
import { CarriedOverCard } from "./coach-profile/CarriedOverCard";
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
  reviews,
  initialTab,
  todayIso,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  // Performance-review cycles for this member (fetched in the page, not in the
  // coaching data layer, so lib/reviews' server deps never reach this bundle).
  reviews: MemberReviewCycle[];
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

  const counts: Partial<Record<CoachTab, number>> = {
    log: detail.meetings.length,
    goals: detail.goals.filter((g) => g.status === "active").length,
    performance: reviews.length,
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
            <CarriedOverCard detail={detail} todayIso={todayIso} />
            <TalkingPointsCard detail={detail} run={run} busy={busy} />
            <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="next" />
            <CommitmentsCard detail={detail} run={run} busy={busy} />
            <PrioritiesCard detail={detail} run={run} busy={busy} />
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

        {tab === "performance" && <PerformanceCard memberName={detail.member.name} reviews={reviews} />}

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
