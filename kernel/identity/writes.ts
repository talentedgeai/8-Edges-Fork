// The writes an entity may make to the kernel's identity tables (multi-entity
// design §4; ME-13). The kernel owns `people`, `admins`, `team_members`,
// `portal_members` and `portal_assume_sessions`, and it is a library with no
// door, so an entity imports this module by its kernel path instead of writing
// the table raw; the table-ownership gate (scripts/check-table-ownership.mjs)
// fails a raw entity write to a kernel table. Each writer is the verb of the
// statement its caller used to build inline — it returns the PostgREST
// builder so the caller keeps its own filters, select and error handling, and
// moving the call here changed no behaviour. The auth guard stays with the
// caller: the kernel does not know which of the four to six entities that
// maintain a person row is acting.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

type Insert<T extends "people" | "admins" | "team_members" | "portal_members" | "portal_assume_sessions"> =
  | TablesInsert<{ schema: "company_os" }, T>
  | TablesInsert<{ schema: "company_os" }, T>[];
type Update<T extends "people" | "admins" | "team_members" | "portal_members" | "portal_assume_sessions"> =
  TablesUpdate<{ schema: "company_os" }, T>;

export const insertPeople = (row: Insert<"people">) => companyOs.from("people").insert(row);
export const updatePeople = (patch: Update<"people">) => companyOs.from("people").update(patch);
export const upsertPeople = (row: Insert<"people">, options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
  companyOs.from("people").upsert(row, options);
export const deletePeople = () => companyOs.from("people").delete();
export const insertAdmins = (row: Insert<"admins">) => companyOs.from("admins").insert(row);
export const updateAdmins = (patch: Update<"admins">) => companyOs.from("admins").update(patch);
export const deleteAdmins = () => companyOs.from("admins").delete();
export const insertTeamMembers = (row: Insert<"team_members">) => companyOs.from("team_members").insert(row);
export const updateTeamMembers = (patch: Update<"team_members">) => companyOs.from("team_members").update(patch);
export const insertPortalMembers = (row: Insert<"portal_members">) => companyOs.from("portal_members").insert(row);
export const updatePortalMembers = (patch: Update<"portal_members">) => companyOs.from("portal_members").update(patch);
export const insertPortalAssumeSessions = (row: Insert<"portal_assume_sessions">) => companyOs.from("portal_assume_sessions").insert(row);
export const updatePortalAssumeSessions = (patch: Update<"portal_assume_sessions">) => companyOs.from("portal_assume_sessions").update(patch);
