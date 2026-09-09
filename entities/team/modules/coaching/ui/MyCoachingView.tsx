"use client";

import { useState } from "react";
import Link from "next/link";
import type { CoachingGoal } from "../types"; import type { CoachingPriority, OceanProfile } from "../data/goals"; import type { Commitment } from "../data/rows"; import type { TalkingPoint } from "../data/profile";
import { MyCommitments } from "./MyCommitments";
import { MyTalkingPoints } from "./MyTalkingPoints";
import { GoalComments } from "./GoalComments";
import { formatDate } from "@/kernel/ui/format";

// The coachee's tabbed view. The server pre-renders recap/check-in markdown and
// passes it in; everything here reads from props. Priorities get their own
// section (personal growth, not a scorecard), and Goals are framed as the path
// to promotion.

type RecapView = { id: string; heldOn: string; html: string; agenda: string[] };
type CheckinView = { id: string; sentAt: string; respondedAt: string | null; html: string };

const MY_TABS = [
  { id: "my", label: "My 1-1" },
  { id: "goals", label: "Goals" },
  { id: "profile", label: "My profile" },
  { id: "history", label: "History" },
] as const;

type MyTab = (typeof MY_TABS)[number]["id"];

function validTab(raw: string | undefined): MyTab {
  return MY_TABS.some((t) => t.id === raw) ? (raw as MyTab) : "my";
}

export function MyCoachingView({
  coachName,
  goals,
  priorities,
  ocean,
  commitments,
  talkingPoints,
  teamMemberId,
  recaps,
  checkins,
  initialTab,
}: {
  coachName: string | null;
  goals: CoachingGoal[];
  priorities: CoachingPriority[];
  ocean: OceanProfile | null;
  commitments: Commitment[];
  talkingPoints: TalkingPoint[];
  teamMemberId: string;
  recaps: RecapView[];
  checkins: CheckinView[];
  initialTab?: string;
}) {
  const [tab, setTab] = useState<MyTab>(validTab(initialTab));

  const selectTab = (id: MyTab) => {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id === "my") url.searchParams.delete("tab");
      else url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const counts: Partial<Record<MyTab, number>> = {
    goals: goals.filter((g) => g.status === "active").length,
  };

  return (
    <div>
      <nav className="admin-tabs coach-tabs" role="tablist" aria-label="My coaching sections">
        {MY_TABS.map((t) => {
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
        {tab === "my" && (
          <>
            <MyTalkingPoints talkingPoints={talkingPoints} teamMemberId={teamMemberId} />

            <section className="admin-card admin-coach-section">
              <div className="admin-card-title">Your commitments</div>
              <div className="admin-hint">
                What you said you&apos;d get done before your next 1-1. Add your own, and drag the stack so the most
                important sits on top. Your coach sees the same order.
              </div>
              <MyCommitments commitments={commitments} teamMemberId={teamMemberId} />
            </section>

            <section className="admin-card admin-coach-section">
              <div className="admin-card-title">Your growth priorities</div>
              <div className="admin-hint">
                What {coachName ?? "your coach"} wants you to focus on for your growth. Reviewed every 1-1, not a
                scorecard.
              </div>
              {priorities.length === 0 ? (
                <div className="admin-empty">No growth priorities set yet. Shape them together in your next 1-1.</div>
              ) : (
                <ul className="admin-mycoach-priorities">
                  {priorities.map((p) => (
                    <li key={p.id}>
                      <strong>{p.title}</strong>
                      {p.detailMarkdown ? <span className="admin-cell-muted">: {p.detailMarkdown}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {tab === "goals" && (
          <section className="admin-card admin-coach-section">
            <div className="admin-card-title">Your FAST goals</div>
            <div className="admin-hint">
              How you&apos;re measured, and your path to promotion. Add, edit, or retire a goal on{" "}
              <Link href="/team/goals">My FAST Goals</Link>.
            </div>
            {goals.length === 0 && (
              <div className="admin-empty">
                No FAST goal set yet.{" "}
                {coachName
                  ? `That's the first thing to shape with ${coachName} in your next 1-1.`
                  : "Add one and it's yours to run."}
              </div>
            )}
            {goals.map((g) => (
              <div key={g.id} className="admin-mycoach-goal-row">
                <div className="admin-mycoach-goal">
                  {g.title}
                  {g.status !== "active" && (
                    <span
                      className={`admin-badge ${g.status === "achieved" ? "admin-badge--ok" : "admin-badge--warn"}`}
                    >
                      {g.status === "achieved" ? "Achieved" : "Draft"}
                    </span>
                  )}
                </div>
                {g.ladder && (
                  <div className="admin-cell-muted">
                    Ladders to: {g.ladder.label}
                  </div>
                )}
                <GoalComments goalId={g.id} comments={g.comments} />
              </div>
            ))}
          </section>
        )}

        {tab === "profile" && (
          <section className="admin-card admin-coach-section">
            <div className="admin-card-title">Your OCEAN profile</div>
            {ocean ? (
              <>
                <div className="admin-hint">
                  How {coachName ?? "your coach"} reads your working style, with the behavior behind each read. It&apos;s
                  a conversation starter for your 1-1s, not a verdict, so bring anything you see differently.
                </div>
                <div className="admin-coach-ocean-list">
                  {(
                    [
                      ["Openness", ocean.openness],
                      ["Conscientiousness", ocean.conscientiousness],
                      ["Extraversion", ocean.extraversion],
                      ["Agreeableness", ocean.agreeableness],
                      ["Neuroticism", ocean.neuroticism],
                    ] as const
                  ).map(([label, dim]) => (
                    <div key={label} className="admin-coach-ocean-line">
                      <div className="admin-coach-ocean-line-head">
                        <strong>{label}</strong>
                        <span className="admin-badge admin-badge--info">{dim.rating ?? "TBD"}</span>
                      </div>
                      {dim.evidence && <div className="admin-cell-muted admin-coach-ocean-line-evidence">{dim.evidence}</div>}
                    </div>
                  ))}
                </div>
                {ocean.snapshotMarkdown && (
                  <div className="coach-block">
                    <span className="admin-eyebrow">Snapshot</span>
                    <p>{ocean.snapshotMarkdown}</p>
                  </div>
                )}
                {ocean.guidanceMarkdown && (
                  <div className="coach-block">
                    <span className="admin-eyebrow">Growth guidance</span>
                    <p className="admin-coach-ocean-guidance">{ocean.guidanceMarkdown}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="admin-empty">
                Your coach hasn&apos;t shared an OCEAN read yet. It shows up here once they publish it.
              </div>
            )}
          </section>
        )}

        {tab === "history" && (
          <>
            <section className="admin-card admin-coach-section">
              <div className="admin-card-title">1-1 recaps</div>
              {recaps.length === 0 && (
                <div className="admin-empty">Recaps from your 1-1s will appear here after each meeting.</div>
              )}
              {recaps.map((r, i) => (
                <details key={r.id} className="admin-mycoach-recap" open={i === 0}>
                  <summary>
                    <strong>{r.heldOn ? formatDate(r.heldOn) : "-"}</strong>
                  </summary>
                  {r.agenda.length > 0 && (
                    <div className="coach-block">
                      <span className="admin-eyebrow">Your agenda for this 1-1</span>
                      <ul className="admin-mycoach-priorities">
                        {r.agenda.map((body, j) => (
                          <li key={j}>{body}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: r.html }} />
                </details>
              ))}
            </section>

            <section className="admin-card admin-coach-section">
              <div className="admin-card-title">Check-ins</div>
              {checkins.length === 0 && (
                <div className="admin-empty">Mid-cycle check-ins between your 1-1s appear here.</div>
              )}
              {checkins.map((c) => (
                <details key={c.id} className="admin-mycoach-recap">
                  <summary>
                    <strong>{c.sentAt ? formatDate(c.sentAt) : "-"}</strong>{" "}
                    {!c.respondedAt && <span className="admin-badge admin-badge--warn">awaiting your update</span>}
                  </summary>
                  <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: c.html }} />
                </details>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
