// The writes other entities may make to team's tables (multi-entity
// design §4; ME-13). Only the owner writes its tables directly; everyone else
// calls one of these through the entity's index, so the table-ownership gate
// (scripts/check-table-ownership.mjs) sees no raw cross-entity write. Each
// writer is the verb of the statement its caller used to build inline — it
// returns the PostgREST builder so the caller keeps its own filters, select
// and error handling, and moving the call here changed no behaviour. A
// caller that needs more than a filter belongs in this entity as a function.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertPersonGitEmails = (row: TablesInsert<{ schema: "company_os" }, "person_git_emails"> | TablesInsert<{ schema: "company_os" }, "person_git_emails">[]) => companyOs.from("person_git_emails").insert(row);
export const insertTimeOff = (row: TablesInsert<{ schema: "company_os" }, "time_off"> | TablesInsert<{ schema: "company_os" }, "time_off">[]) => companyOs.from("time_off").insert(row);
export const updateLeavePolicies = (patch: TablesUpdate<{ schema: "company_os" }, "leave_policies">) => companyOs.from("leave_policies").update(patch);
export const updateOnboardingTasks = (patch: TablesUpdate<{ schema: "company_os" }, "onboarding_tasks">) => companyOs.from("onboarding_tasks").update(patch);
export const updateTimeOff = (patch: TablesUpdate<{ schema: "company_os" }, "time_off">) => companyOs.from("time_off").update(patch);
