// The coaching module's client-safe vocabulary (ME-11): the status enums,
// their labels and the goal/ladder shapes that the coaching UI, the member's
// goals panel and the admin goals editor render. They live apart from data.ts
// because that file reaches the company-os door — a server-only barrel — for
// the board link, and a client component importing data.ts for a label would
// drag that barrel into its bundle. data.ts re-exports everything here, so its
// server callers keep one import.

export type GoalStatus = "draft" | "active" | "achieved" | "dropped";
export type PriorityStatus = "active" | "retired";
export type RetentionRoot = "belonging" | "links" | "sacrifice" | "watching";
export type OneOnOneStatus = "scheduled" | "held" | "skipped";
export type CommitmentOwner = "coach" | "member";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  draft: "Draft",
  active: "Active",
  achieved: "Achieved",
  dropped: "Dropped",
};

export const RETENTION_ROOT_LABELS: Record<RetentionRoot, string> = {
  belonging: "Belonging (fit)",
  links: "Links",
  sacrifice: "Sacrifice",
  watching: "Watching",
};
export type CommitmentStatus =
  | "open"
  | "on_track"
  | "needs_attention"
  | "completed"
  | "dropped"
  | "blocked";

export const OPEN_COMMITMENT_STATUSES: CommitmentStatus[] = [
  "open",
  "on_track",
  "needs_attention",
  "blocked",
];

export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  open: "Open",
  on_track: "On track",
  needs_attention: "Needs attention",
  completed: "Completed",
  dropped: "Dropped",
  blocked: "Blocked",
};


export type EdgesLadder =
  | { kind: "objective"; id: string; label: string }
  | { kind: "key_result"; id: string; label: string };

export type GoalComment = {
  id: string;
  goalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type CoachingGoal = {
  id: string;
  title: string;
  descriptionMarkdown: string | null;
  status: GoalStatus;
  quarterLabel: string | null;
  ladder: EdgesLadder | null;
  sortOrder: number;
  comments: GoalComment[];
  // The member-authored measure (/team/goals). Null on goals that carry no
  // number of their own.
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
  // The team member who wrote the goal, null on goals set by a coach or
  // predating authorship. Only the author may delete it.
  createdBy: string | null;
};


// Everything the ladder picker offers: the company objectives and their key
// results. Both tables are small.
export type EdgesOptions = {
  objectives: { id: string; label: string }[];
  keyResults: { id: string; label: string; objectiveId: string | null }[];
};

// Ladder input from the picker: at most one Edges target.
export type LadderInput =
  | { kind: "none" }
  | { kind: "objective" | "key_result"; id: string };

export type AdminMemberGoals = {
  teamMemberId: string;
  name: string;
  goals: CoachingGoal[];
};

export const OCEAN_DIMENSIONS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
export type OceanDimensionKey = (typeof OCEAN_DIMENSIONS)[number];
