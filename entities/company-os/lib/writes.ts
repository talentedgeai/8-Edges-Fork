// The writes other entities may make to company-os's tables (multi-entity
// design §4; ME-13). Only the owner writes its tables directly; everyone else
// calls one of these through the entity's index, so the table-ownership gate
// (scripts/check-table-ownership.mjs) sees no raw cross-entity write. Each
// writer is the verb of the statement its caller used to build inline — it
// returns the PostgREST builder so the caller keeps its own filters, select
// and error handling, and moving the call here changed no behaviour. A
// caller that needs more than a filter belongs in this entity as a function.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertCompanies = (row: TablesInsert<{ schema: "company_os" }, "companies"> | TablesInsert<{ schema: "company_os" }, "companies">[]) => companyOs.from("companies").insert(row);
export const insertDeals = (row: TablesInsert<{ schema: "company_os" }, "deals"> | TablesInsert<{ schema: "company_os" }, "deals">[]) => companyOs.from("deals").insert(row);
export const insertEquipmentRequests = (row: TablesInsert<{ schema: "company_os" }, "equipment_requests">) => companyOs.from("equipment_requests").insert(row);
export const insertIdeas = (row: TablesInsert<{ schema: "company_os" }, "ideas">) => companyOs.from("ideas").insert(row);
export const insertInquiries = (row: TablesInsert<{ schema: "company_os" }, "inquiries"> | TablesInsert<{ schema: "company_os" }, "inquiries">[]) => companyOs.from("inquiries").insert(row);
export const insertInterviewInterviewers = (row: TablesInsert<{ schema: "company_os" }, "interview_interviewers"> | TablesInsert<{ schema: "company_os" }, "interview_interviewers">[]) => companyOs.from("interview_interviewers").insert(row);
export const insertMeetings = (row: TablesInsert<{ schema: "company_os" }, "meetings"> | TablesInsert<{ schema: "company_os" }, "meetings">[]) => companyOs.from("meetings").insert(row);
export const insertTaskStageLog = (row: TablesInsert<{ schema: "company_os" }, "task_stage_log">) => companyOs.from("task_stage_log").insert(row);
export const insertTasks = (row: TablesInsert<{ schema: "company_os" }, "tasks"> | TablesInsert<{ schema: "company_os" }, "tasks">[]) => companyOs.from("tasks").insert(row);
export const updateTasks = (patch: TablesUpdate<{ schema: "company_os" }, "tasks">) => companyOs.from("tasks").update(patch);
export const updateApplications = (patch: TablesUpdate<{ schema: "company_os" }, "applications">) => companyOs.from("applications").update(patch);
export const updateCompanies = (patch: TablesUpdate<{ schema: "company_os" }, "companies">) => companyOs.from("companies").update(patch);
export const updateIdeas = (patch: TablesUpdate<{ schema: "company_os" }, "ideas">) => companyOs.from("ideas").update(patch);
export const updateInquiries = (patch: TablesUpdate<{ schema: "company_os" }, "inquiries">) => companyOs.from("inquiries").update(patch);
export const updateMeetings = (patch: TablesUpdate<{ schema: "company_os" }, "meetings">) => companyOs.from("meetings").update(patch);
export const upsertCallTranscripts = (row: TablesInsert<{ schema: "company_os" }, "call_transcripts"> | TablesInsert<{ schema: "company_os" }, "call_transcripts">[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
  companyOs.from("call_transcripts").upsert(row, options);
export const upsertPeopleSensitiveRow = (row: TablesInsert<{ schema: "company_os" }, "people_sensitive"> | TablesInsert<{ schema: "company_os" }, "people_sensitive">[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
  companyOs.from("people_sensitive").upsert(row, options);
