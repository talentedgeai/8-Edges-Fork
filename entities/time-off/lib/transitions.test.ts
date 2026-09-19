import { describe, expect, it } from "vitest";
import { nextLeaveStatus, type LeaveActor, type LeaveDecision, type LeaveStatus } from "./transitions";

// The whole table, one row per cell, the way balance.test.ts tests
// computeLeaveBalance. Before A.7 nothing here was reachable without a full
// server action and live auth, so none of it was tested at all.

const STATUSES: LeaveStatus[] = ["requested", "approved", "rejected", "cancelled", "taken"];

/** Compact form of a transition, so a table reads as a table. */
const cell = (current: LeaveStatus, decision: LeaveDecision, actor: LeaveActor) => {
  const t = nextLeaveStatus(current, decision, actor);
  return t.outcome === "apply" ? t.status : t.outcome === "noop" ? "noop" : `refuse: ${t.error}`;
};

describe("an admin deciding leave", () => {
  it("approves only from pending", () => {
    expect(cell("requested", "approved", "admin")).toBe("approved");
    for (const s of STATUSES.filter((s) => s !== "requested")) {
      expect(cell(s, "approved", "admin")).toBe("refuse: Only pending requests can be approved.");
    }
  });

  it("denies from pending AND from approved, which is the override", () => {
    // Auto-approved leave, or leave approved earlier, can still be denied.
    // This is the one thing the admin surface can do that the portal cannot.
    expect(cell("requested", "rejected", "admin")).toBe("rejected");
    expect(cell("approved", "rejected", "admin")).toBe("rejected");
    for (const s of ["rejected", "cancelled", "taken"] as LeaveStatus[]) {
      expect(cell(s, "rejected", "admin")).toBe("refuse: Only pending or approved leave can be denied.");
    }
  });
});

describe("a client manager deciding leave", () => {
  it("decides a pending request", () => {
    expect(cell("requested", "approved", "client-manager")).toBe("approved");
    expect(cell("requested", "rejected", "client-manager")).toBe("rejected");
  });

  it("never revisits a decision, which is where it is narrower than an admin", () => {
    // The stated rule, not an accident of one file's guard: a client manager
    // cannot deny leave an Edge8 admin already approved.
    expect(cell("approved", "rejected", "client-manager")).toBe("refuse: This request has already been decided.");
    expect(cell("approved", "rejected", "admin")).toBe("rejected");
  });

  it("cannot cancel at all", () => {
    expect(cell("approved", "cancelled", "client-manager")).toBe("refuse: You cannot cancel this request.");
  });
});

describe("cancelling", () => {
  it("is idempotent for both surfaces that offer it", () => {
    expect(cell("cancelled", "cancelled", "admin")).toBe("noop");
    expect(cell("cancelled", "cancelled", "employee")).toBe("noop");
  });

  it("refuses leave that has already been taken", () => {
    expect(cell("taken", "cancelled", "admin")).toBe("refuse: Taken leave cannot be cancelled.");
    expect(cell("taken", "cancelled", "employee")).toBe("refuse: Taken leave cannot be cancelled.");
  });

  it("cancels from every other status, for admin and employee alike", () => {
    for (const s of ["requested", "approved", "rejected"] as LeaveStatus[]) {
      expect(cell(s, "cancelled", "admin")).toBe("cancelled");
      expect(cell(s, "cancelled", "employee")).toBe("cancelled");
    }
  });
});

describe("an employee", () => {
  it("withdraws their own request but never decides one", () => {
    expect(cell("requested", "cancelled", "employee")).toBe("cancelled");
    expect(cell("requested", "approved", "employee")).toBe("refuse: You cannot decide your own leave.");
    expect(cell("requested", "rejected", "employee")).toBe("refuse: You cannot decide your own leave.");
  });
});

describe("the table as a whole", () => {
  it("answers every combination without throwing, and applies only a legal status", () => {
    const legal = new Set(["approved", "rejected", "cancelled"]);
    for (const actor of ["admin", "employee", "client-manager"] as LeaveActor[]) {
      for (const decision of ["approved", "rejected", "cancelled"] as LeaveDecision[]) {
        for (const current of STATUSES) {
          const t = nextLeaveStatus(current, decision, actor);
          if (t.outcome === "apply") {
            expect(legal.has(t.status)).toBe(true);
            // A transition never writes the status the row already has.
            expect(t.status).not.toBe(current);
          }
        }
      }
    }
  });
});
