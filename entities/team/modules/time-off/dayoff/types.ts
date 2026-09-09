// Day Off (day-off.app) import types and mappings.
// See docs/plans/2026-07-05-dayoff-migration-plan.md for the full rules.
//
// NOTE: enums here mirror DB CHECK constraints on company_os.time_off and
// company_os.leave_adjustments. Deliberately not imported from lib/admin/time-off
// so this module stays runnable from a plain CLI (no path aliases, no React deps).

export type LeaveCategory =
  | "vacation"
  | "sick"
  | "personal"
  | "parental"
  | "bereavement"
  | "unpaid"
  | "public_holiday"
  | "other";

export type TimeOffStatus = "requested" | "approved" | "rejected" | "cancelled" | "taken";

// Day Off leave type name (lowercased) -> our category. Fail-open to 'other'
// with a report warning; the mapping is reviewed by the admin in the report.
// "Schedule" is Edge8's single Day Off type = the vacation allowance.
export const TYPE_NAME_MAP: Record<string, LeaveCategory> = {
  schedule: "vacation",
  vacation: "vacation",
  "annual leave": "vacation",
  sick: "sick",
  "sick leave": "sick",
  personal: "personal",
  parental: "parental",
  maternity: "parental",
  paternity: "parental",
  bereavement: "bereavement",
  unpaid: "unpaid",
  "unpaid leave": "unpaid",
};

// Day Off request status name (lowercased) -> our status. FAIL-CLOSED: any
// status encountered on a request that is not in this map aborts the request
// import with a clear error, so nothing lands with a guessed status.
// Edge8's live status list (from /leaveRequestStatuses): Pending Approver1,
// Pending Approver2, Accepted, Rejected Approver1, Rejected Approver2,
// Deleted Request, Skipped Step 1, Skipped Step 2. The two "Skipped" statuses
// are deliberately unmapped (semantics unverified) so they fail closed.
// NOTE: the /leaveRequestStatuses list spells names WITH spaces ("Deleted
// Request"), but the value on an actual request is CONCATENATED ("DeletedRequest").
// Map both forms.
export const STATUS_NAME_MAP: Record<string, TimeOffStatus> = {
  pending: "requested",
  "pending approver1": "requested",
  pendingapprover1: "requested",
  "pending approver2": "requested",
  pendingapprover2: "requested",
  requested: "requested",
  approved: "approved",
  accepted: "approved",
  rejected: "rejected",
  "rejected approver1": "rejected",
  rejectedapprover1: "rejected",
  "rejected approver2": "rejected",
  rejectedapprover2: "rejected",
  denied: "rejected",
  cancelled: "cancelled",
  canceled: "cancelled",
  "deleted request": "cancelled",
  deletedrequest: "cancelled",
  taken: "taken",
};

// Day Off email -> CRM email, for people whose accounts use different domains.
// Applied at match time (both sides lowercased).
export const EMAIL_ALIASES: Record<string, string> = {
  // Fork note: upstream seeds real staff aliases here. Emptied for the public
  // fork — an alias map is a name-to-name directory, which is exactly the kind
  // of thing worth not publishing. Add your own entries as needed.
};

// --- Day Off API response shapes (only the fields we read) ---

export type DayoffLeaveType = {
  LeaveTypeID: number;
  Name: string;
  LeaveTypeColor: string | null;
  MonthlyReset: boolean;
  IsHours: boolean;
  IsEnabled: boolean;
};

export type DayoffStatus = { LeaveRequestStatusID: number; Name: string };

export type DayoffEmployee = {
  EmployeeID: number;
  Name: string | null;
  Email: string | null;
  IsManager: boolean;
  IsAdmin: boolean;
  JoiningDate: string | null;
  TeamName: string | null;
  LocationName: string | null;
  LeavePolicyName: string | null;
};

export type DayoffEmployeeList = {
  Total: number;
  PageNumber: number;
  Limit: number;
  Results: DayoffEmployee[];
};

export type DayoffCompanyLeaveType = {
  CompanyLeaveTypeID: number;
  LeaveTypeID: number;
  DefaultBalance: number | null;
  AllowsNegativeBalance: boolean;
  AllowsInfiniteBalance: boolean;
  IsSelected: boolean;
  IsHalfDay: boolean;
  MonthlyReset: boolean;
  ApprovalNotRequired: boolean;
  IsReasonRequired: boolean;
  IsHours: boolean;
  AccrualTypeID: number | null;
  AccrualNextDate: string | null;
  IsAccrualMonthStart: boolean;
  HasCarry: boolean;
  CarryExpiredDurationInDays: number | null;
  CarryLimitedBalance: number | null;
  MaxNegativeNumber: number | null;
  MaxUnusedBalance: number | null;
  BalanceEffectiveAfter: number | null;
  BalanceEffectiveAfterUnitID: number | null;
  CountHolidays: boolean;
  CountWeekends: boolean;
  CountHolidaysAfter: number | null;
  CountWeekendsAfter: number | null;
  BalanceResetTypeID: number | null;
  BalanceResetMonthID: number | null;
  LeaveTypeName?: string | null;
};

export type DayoffPolicy = {
  LeavePolicyID: number;
  Name: string;
  IsDefault: boolean;
  isResetCarryOver: boolean | null;
  MonthID: number | null;
  CompanyLeaveTypes: DayoffCompanyLeaveType[] | null;
};

export type DayoffRequest = {
  LeaveRequestID: number;
  EmployeeID: number;
  LeaveTypeID: number;
  LeaveTypeName: string | null;
  FromDate: string;
  ToDate: string;
  NumberOfDays: number | null;
  NumberOfHours: number | null;
  StatusID: number | string;
  StatusName: string | null;
  Description: string | null;
  ManagerRejectionReason: string | null;
  IsCompOff: boolean | null;
  IsHours: boolean | null;
  CreatedAt: string | null;
  Approver1ID: number | null;
  ForcedByID: number | null;
  DocumentUrl: string | null;
  OriginalRequestID: number | null;
};

export type DayoffRequestsList = { Pending: DayoffRequest[] | null; History: DayoffRequest[] | null };

export type DayoffBalanceRow = {
  LeaveTypeID: number;
  LeaveTypeName: string | null;
  CompanyLeaveTypeID: number | null;
  IsAccrualType: boolean;
  TotalBalance: number | null;
  UsedBalance: number | null;
  Balance: number | null;
  // NOTE: the API's JSON key is literally misspelled "Qouta".
  Qouta: number | null;
  CarryBalance: number | null;
  Adjustment: number | null;
  CompOffBalance: number | null;
  IsActive: boolean;
  LeaveTypeEnable: boolean;
};

export type DayoffBalanceList = { Results: DayoffBalanceRow[] | null };

export type DayoffIntervalGroup = {
  IntervalGroupDisplayName: string | null;
  IntervalGroupOrder: number;
  IntervalDtoGroup:
    | {
        EmployeeIntervalID: number;
        IntervalFromDate: string | null;
        IntervalToDate: string | null;
        IsCurrent: boolean;
      }[]
    | null;
};

export type DayoffIntervals = { IntervalGroups: DayoffIntervalGroup[] | null };
