import { companyOs } from "@/kernel/data/supabase";

// How many live AI Programs each company has. The portal owns ai_programs, so
// this is the door other entities use for the count (the admin Client Hubs
// list shows it per client) instead of reading the table across the boundary.
export async function countActiveProgramsByCompany(): Promise<Map<string, number>> {
  const { data, error } = await companyOs.from("ai_programs").select("company_id").neq("status", "archived");
  if (error) throw new Error(`ai_programs: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
  return counts;
}
