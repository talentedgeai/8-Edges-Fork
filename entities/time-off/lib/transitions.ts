// Which statuses a leave request may move to, and who may move it.
//
// Three surfaces decide leave — the admin screen, the employee's own page, and
// the client portal — and until A.7 each hard-coded its own guard. They did not
// agree: an admin may deny leave that is already approved, a client manager may
// not, and nothing anywhere said that was intended. The surface difference is
// stated here now, as a row in one table, rather than implied by three guards
// in three files that nobody reads together.
//
// Pure on purpose. These rules were previously reachable only through a full
// server action with live auth, so no test touched them; the way
// balance.test.ts table-tests computeLeaveBalance is the way this is tested.
//
// What does NOT live here is authorization. The team and admin action files
// deliberately do not share code, for the IDOR reasons stated in them: "self"
// and "self or report" are different scopes and the check belongs beside the
// query that enforces it. This module answers "may this status become that
// one", never "is this caller allowed to ask".

export type LeaveStatus = "requested" | "approved" | "rejected" | "cancelled" | "taken";
export type LeaveDecision = "approved" | "rejected" | "cancelled";

/**
 * Who is asking. Not a permission — the caller has already proved it is this
 * actor — but the surface whose rules apply.
 *
 *  - `admin`          an Edge8 admin on /admin/operations/time-off.
 *  - `employee`       the person whose leave it is, on /team/time-off.
 *  - `client-manager` a client's manager in the portal, deciding leave for the
 *    staff assigned to them.
 */
export type LeaveActor = "admin" | "employee" | "client-manager";

/**
 * What the caller should do:
 *
 *  - `apply`  write this status.
 *  - `noop`   the request is already there; return ok without writing. Cancel
 *             is idempotent on both self-serve surfaces, and always was.
 *  - `refuse` return this sentence as the action's error.
 */
export type LeaveTransition =
  | { outcome: "apply"; status: LeaveStatus }
  | { outcome: "noop" }
  | { outcome: "refuse"; error: string };

const apply = (status: LeaveStatus): LeaveTransition => ({ outcome: "apply", status });
const refuse = (error: string): LeaveTransition => ({ outcome: "refuse", error });

export function nextLeaveStatus(
  current: LeaveStatus,
  decision: LeaveDecision,
  actor: LeaveActor,
): LeaveTransition {
  if (decision === "cancelled") return cancel(current, actor);

  if (actor === "employee") {
    // An employee withdraws their own request; they never decide one. No
    // surface offers this today, and the rule is written down so none can
    // acquire it by accident.
    return refuse("You cannot decide your own leave.");
  }

  if (actor === "client-manager") {
    // Strictly narrower than admin, and deliberately so: a client manager
    // decides a request while it is still pending and never revisits a
    // decision an Edge8 admin has made. Before A.7 this was a lone
    // `status !== "requested"` in entities/portal/lib/time-off.ts with nothing
    // saying whether the difference was a rule or an oversight.
    return current === "requested" ? apply(decision) : refuse("This request has already been decided.");
  }

  if (decision === "approved") {
    return current === "requested" ? apply("approved") : refuse("Only pending requests can be approved.");
  }
  // The admin override: denying leave that was auto-approved by policy, or
  // approved earlier, is the whole reason this differs from approval.
  return current === "requested" || current === "approved"
    ? apply("rejected")
    : refuse("Only pending or approved leave can be denied.");
}

function cancel(current: LeaveStatus, actor: LeaveActor): LeaveTransition {
  if (actor === "client-manager") return refuse("You cannot cancel this request.");
  if (current === "cancelled") return { outcome: "noop" };
  if (current === "taken") return refuse("Taken leave cannot be cancelled.");
  return apply("cancelled");
}
