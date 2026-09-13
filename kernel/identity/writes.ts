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

type Insert<T extends "people" | "admins" | "team_members" | "portal_members" | "portal_assume_sessions" | "companies" | "documents"> =
  | TablesInsert<{ schema: "company_os" }, T>
  | TablesInsert<{ schema: "company_os" }, T>[];
type Update<T extends "people" | "admins" | "team_members" | "portal_members" | "portal_assume_sessions" | "companies" | "documents"> =
  TablesUpdate<{ schema: "company_os" }, T>;

export const insertPeople = (row: Insert<"people">) => companyOs.from("people").insert(row);
export const updatePeople = (patch: Update<"people">) => companyOs.from("people").update(patch);
export const upsertPeople = (row: Insert<"people">, options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
  companyOs.from("people").upsert(row, options);
export const deletePeople = () => companyOs.from("people").delete();
// `companies` is a kernel table for the same reason `people` is: portal-auth
// resolves the signed-in member's company on every request, and a kernel that
// imports an entity to do it would be worse than a kernel table with no
// exclusive owner. Contacts owns the screens over it (RS-01).
export const insertCompanies = (row: Insert<"companies">) => companyOs.from("companies").insert(row);
export const updateCompanies = (patch: Update<"companies">) => companyOs.from("companies").update(patch);
export const deleteCompanies = () => companyOs.from("companies").delete();
// `documents` is a kernel table too: it is file metadata, not any one entity's
// business — hiring stores resumes in it, company-os stores contracts, portal
// stores deliverables. An owner among them would make every other entity ask
// that one for permission to keep a file.
export const insertDocuments = (row: Insert<"documents">) => companyOs.from("documents").insert(row);
export const deleteDocuments = () => companyOs.from("documents").delete();
export const insertAdmins = (row: Insert<"admins">) => companyOs.from("admins").insert(row);
export const updateAdmins = (patch: Update<"admins">) => companyOs.from("admins").update(patch);
export const deleteAdmins = () => companyOs.from("admins").delete();
export const insertTeamMembers = (row: Insert<"team_members">) => companyOs.from("team_members").insert(row);
export const updateTeamMembers = (patch: Update<"team_members">) => companyOs.from("team_members").update(patch);
export const insertPortalMembers = (row: Insert<"portal_members">) => companyOs.from("portal_members").insert(row);
export const updatePortalMembers = (patch: Update<"portal_members">) => companyOs.from("portal_members").update(patch);
export const insertPortalAssumeSessions = (row: Insert<"portal_assume_sessions">) => companyOs.from("portal_assume_sessions").insert(row);
export const updatePortalAssumeSessions = (patch: Update<"portal_assume_sessions">) => companyOs.from("portal_assume_sessions").update(patch);
