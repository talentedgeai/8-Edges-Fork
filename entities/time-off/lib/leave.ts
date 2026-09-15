import type { BadgeTone } from "@/kernel/ui/Badge";

// Leave types are constrained at the DB (company_os.time_off_leave_type_check).
// Keep this list in sync with that constraint.
export const LEAVE_TYPES = [
  "vacation",
  "sick",
  "personal",
  "parental",
  "bereavement",
  "unpaid",
  "public_holiday",
  "other",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  parental: "Parental",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
  public_holiday: "Public holiday",
  other: "Other",
};

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
    case "taken":
      return "ok";
    case "rejected":
      return "err";
    case "requested":
      return "warn";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

// Working days between two ISO dates (inclusive), excluding weekends. A half-day
// request is a single day counted as 0.5. Public-holiday awareness is deferred
// to the holidays table (Phase 2); for now only weekends are excluded.
export function countWorkingDays(
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
): number {
  if (isHalfDay) return 0.5;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

export function formatDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

// Format a synced leave-balance number for the People table: round to at most
// one decimal and drop a trailing ".0". 12 → "12", 10.15 → "10.2", 13.32 → "13.3".
export function formatLeaveBalance(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
