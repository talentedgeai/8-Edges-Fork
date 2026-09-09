import { beforeEach, describe, expect, it, vi } from "vitest";

// Characterisation tests for the onboarding cycle's pure clock rules and for
// one milestone's date condition. The milestones were lifted out of one long
// `runOnboardingCycle` loop; these pin the conditions that decide whether an
// email goes out at all.

type EmailArgs = { to: string | string[]; subject: string; html: string };
const sendTransactionalEmail = vi.fn(async (_args: EmailArgs) => true);

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {},
  supabase: {},
}));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: (args: EmailArgs) => sendTransactionalEmail(args),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://arca-wellness.test" }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/identity/writes", () => ({ updateTeamMembers: vi.fn() }));

import { computeStage, cycleDay, type CycleRow, type CycleRunSummary } from "./cycle";
import { planNagMilestone, type MilestoneCtx } from "./milestones";

const member = (over: Partial<CycleRow["member"]> = {}): CycleRow["member"] => ({
  personId: "p1",
  name: "Mai",
  email: "derek.nguyen@edge8.ai",
  avatarUrl: null,
  positionTitle: "Analyst",
  startDate: "2026-08-01",
  managerId: "m1",
  status: "active",
  employmentStage: "probation",
  probationEndsOn: null,
  contractStartDate: null,
  ...over,
});

const row = (over: Partial<CycleRow> = {}): CycleRow =>
  ({
    id: "j1",
    team_member_id: "tm1",
    stage: "day_1",
    plan_url: null,
    plan_path: null,
    plan_uploaded_at: null,
    day8_survey_sent_at: null,
    day8_response_id: null,
    day45_email_sent_at: null,
    decision: null,
    decision_at: null,
    day60_promoted_at: null,
    day180_email_sent_at: null,
    completed_at: null,
    member: member(),
    ...over,
  }) as CycleRow;

describe("cycleDay", () => {
  it("counts start_date as Day 1 and the day before as Day 0", () => {
    expect(cycleDay("2026-08-01", "2026-08-01")).toBe(1);
    expect(cycleDay("2026-08-01", "2026-07-31")).toBe(0);
    expect(cycleDay("2026-08-01", "2026-07-26")).toBe(-5);
    expect(cycleDay("2026-08-01", "2026-08-08")).toBe(8);
  });
});

describe("computeStage", () => {
  it("is complete once Day 180 has gone out or the journey is closed", () => {
    expect(computeStage(row({ day180_email_sent_at: "2027-01-01" }), "2026-08-01")).toBe("complete");
    expect(computeStage(row({ completed_at: "2027-01-01" }), "2026-08-01")).toBe("complete");
  });

  it("is preboarding with no start date, or before Day 1", () => {
    expect(computeStage(row({ member: member({ startDate: null }) }), "2026-08-01")).toBe("preboarding");
    expect(computeStage(row(), "2026-07-30")).toBe("preboarding");
  });

  it("walks day_1 -> day_8 -> day_45 -> day_60 on the default 60-day probation", () => {
    expect(computeStage(row(), "2026-08-01")).toBe("day_1"); // d = 1
    expect(computeStage(row(), "2026-08-08")).toBe("day_8"); // d = 8
    // probation ends start + 59 = 2026-09-29; day_45 opens 15 days before.
    expect(computeStage(row(), "2026-09-14")).toBe("day_45");
    expect(computeStage(row(), "2026-09-29")).toBe("day_60");
  });

  it("follows an extended probation end date", () => {
    const extended = row({ member: member({ probationEndsOn: "2026-10-29" }) });
    expect(computeStage(extended, "2026-09-29")).toBe("day_8");
    expect(computeStage(extended, "2026-10-14")).toBe("day_45");
    expect(computeStage(extended, "2026-10-29")).toBe("day_60");
  });

  it("treats a recorded promotion as day_60 regardless of the clock", () => {
    expect(computeStage(row({ day60_promoted_at: "2026-08-05" }), "2026-08-08")).toBe("day_60");
  });

  it("reaches day_180 at Day 180", () => {
    expect(computeStage(row(), "2027-01-27")).toBe("day_180"); // d = 180
  });
});

describe("planNagMilestone", () => {
  const summary = (): CycleRunSummary =>
    ({
      date: "2026-07-28",
      journeys: 1,
      backfilled: 0,
      planNags: 0,
      day8Sent: 0,
      reviewsSent: 0,
      decisionReminders: 0,
      promoted: 0,
      day180Sent: 0,
    }) as CycleRunSummary;

  const ctx = (over: Partial<MilestoneCtx> = {}): MilestoneCtx => ({
    todayISO: "2026-07-28",
    d: cycleDay("2026-08-01", "2026-07-28"), // -3
    start: "2026-08-01",
    probEnd: "2026-09-29",
    manager: { name: "Linh", email: "derek.nguyen@edge8.ai" },
    name: "Mai",
    origin: "https://arca-wellness.test",
    boardLink: "https://arca-wellness.test/team/onboarding",
    alreadyFullTime: false,
    summary: summary(),
    patchJourney: vi.fn(async () => {}),
    recruiterEmailFor: vi.fn(async () => null),
    ...over,
  });

  beforeEach(() => sendTransactionalEmail.mockClear());

  it("nags the manager and the talent director inside the T-6..Day 0 window", async () => {
    const c = ctx();
    expect(await planNagMilestone(row(), c)).toBe(false);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = sendTransactionalEmail.mock.calls[0][0];
    expect(call.to).toEqual(["derek.nguyen@edge8.ai", "derek.nguyen@edge8.ai"]);
    expect(call.subject).toBe("Onboarding plan needed before Day 1: Mai");
    expect(call.html).toContain("4 days away");
    expect(c.summary.planNags).toBe(1);
  });

  it("stays silent before T-6 and after Day 1", async () => {
    for (const d of [-7, 1, 30]) {
      const c = ctx({ d });
      await planNagMilestone(row(), c);
      expect(sendTransactionalEmail).not.toHaveBeenCalled();
      expect(c.summary.planNags).toBe(0);
    }
  });

  it("stays silent once a plan link or an uploaded plan exists", async () => {
    await planNagMilestone(row({ plan_url: "https://docs/plan" }), ctx());
    await planNagMilestone(row({ plan_path: "plans/mai.md" }), ctx());
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("stays silent when the manager has no email to nag", async () => {
    await planNagMilestone(row(), ctx({ manager: undefined }));
    await planNagMilestone(row(), ctx({ manager: { name: "Linh", email: null } }));
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not count a nag the mailer refused to send", async () => {
    sendTransactionalEmail.mockResolvedValueOnce(false);
    const c = ctx();
    await planNagMilestone(row(), c);
    expect(c.summary.planNags).toBe(0);
  });
});
