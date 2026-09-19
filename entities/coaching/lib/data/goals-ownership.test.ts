import { beforeEach, describe, expect, it, vi } from "vitest";

// A FAST goal belongs to the person, not to a coach's roster. coaching_profiles
// has one row per team member (team_member_id is unique) and `active` says
// whether a coach currently runs their 1-1 rhythm. Every read or write that
// finds "this person's profile" for goals must therefore ignore `active`;
// filtering on it made a member removed from a roster unable to save a goal
// (K.3, B4) and, once that was fixed, unable to see the goal they saved.

const calls: { table: string; ops: string[]; payloads: unknown[] }[] = [];
function builderFor(table: string) {
  const record = { table, ops: [] as string[], payloads: [] as unknown[] };
  calls.push(record);
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "coaching_profiles" ? { id: "p1" } : [], error: null }).then(resolve),
  };
  for (const op of ["select", "insert", "update", "delete", "eq", "in", "is", "order", "limit", "maybeSingle", "single"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("./goals", () => ({
  GOAL_SELECT: "id",
  OCEAN_SELECT: "id",
  PRIORITY_SELECT: "id",
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
  toGoal: (r: unknown) => r,
  toOcean: (r: unknown) => r,
  toPriority: (r: unknown) => r,
  attachComments: (g: unknown) => g,
  getGoalComments: async () => [],
}));

import { getCoachingProfileIdForMember } from "./shared";
import { getTeamMemberActiveGoals } from "./member-goals";
import { getMyGoals } from "./my-goals";
import type { TeamActor } from "@/kernel/identity/team-auth";

const profileFilters = () =>
  calls
    .filter((c) => c.table === "coaching_profiles")
    .flatMap((c) => c.payloads.filter((p) => Array.isArray(p) && p[0] === "active"));

describe("goal reads find the person's profile regardless of roster state", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("getCoachingProfileIdForMember", async () => {
    await getCoachingProfileIdForMember("tm-1");
    expect(profileFilters()).toEqual([]);
  });

  it("getTeamMemberActiveGoals", async () => {
    await getTeamMemberActiveGoals("tm-1");
    expect(profileFilters()).toEqual([]);
  });

  it("getMyGoals", async () => {
    await getMyGoals({ teamMemberId: "tm-1" } as TeamActor);
    expect(profileFilters()).toEqual([]);
  });
});
