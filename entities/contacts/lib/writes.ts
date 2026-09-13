// The writes other entities may make to contacts' tables (design §4, ME-13).
// Only the owner writes its tables directly; everyone else calls one of these
// through the entity's index, so the table-ownership gate sees no raw
// cross-entity write. Each writer returns the PostgREST builder so the caller
// keeps its own filters and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const upsertPeopleSensitiveRow = (
  row: TablesInsert<{ schema: "company_os" }, "people_sensitive"> | TablesInsert<{ schema: "company_os" }, "people_sensitive">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("people_sensitive").upsert(row, options);
export const insertStaffAssignments = (row: TablesInsert<{ schema: "company_os" }, "staff_assignments"> | TablesInsert<{ schema: "company_os" }, "staff_assignments">[]) => companyOs.from("staff_assignments").insert(row);
export const updateStaffAssignments = (patch: TablesUpdate<{ schema: "company_os" }, "staff_assignments">) => companyOs.from("staff_assignments").update(patch);
export const insertAffiliates = (row: TablesInsert<{ schema: "company_os" }, "affiliates"> | TablesInsert<{ schema: "company_os" }, "affiliates">[]) => companyOs.from("affiliates").insert(row);
export const updateAffiliates = (patch: TablesUpdate<{ schema: "company_os" }, "affiliates">) => companyOs.from("affiliates").update(patch);
export const upsertBrandProfiles = (
  row: TablesInsert<{ schema: "company_os" }, "brand_profiles"> | TablesInsert<{ schema: "company_os" }, "brand_profiles">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("brand_profiles").upsert(row, options);
export const insertPersonCompanies = (row: TablesInsert<{ schema: "company_os" }, "person_companies"> | TablesInsert<{ schema: "company_os" }, "person_companies">[]) => companyOs.from("person_companies").insert(row);
export const updatePersonCompanies = (patch: TablesUpdate<{ schema: "company_os" }, "person_companies">) => companyOs.from("person_companies").update(patch);

