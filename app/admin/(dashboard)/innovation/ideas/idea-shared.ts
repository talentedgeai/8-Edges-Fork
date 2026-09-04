// Shared between the backlog list page (server) and the shelf (client).

export type IdeaRow = {
  id: string;
  kind: string;
  title: string;
  problem: string | null;
  data_needed: string | null;
  workflow: string | null;
  roi: string | null;
  story: string | null;
  takeaway: string | null;
  office: string | null;
  ai_plan: string | null;
  ai_model: string | null;
  ai_error: string | null;
  status: string;
  created_at: string;
  people: { full_name: string | null; preferred_name: string | null; email: string } | null;
  // Server-rendered HTML of ai_plan, attached by the list page so the client
  // shelf never has to parse markdown.
  planHtml?: string | null;
};

// people!person_id: explicit FK hint — bare embeds break at runtime when two
// FKs link the tables.
export const IDEA_SELECT =
  "id, kind, title, problem, data_needed, workflow, roi, story, takeaway, office, ai_plan, ai_model, ai_error, " +
  "status, created_at, people:people!person_id(full_name, preferred_name, email)";

export function submitterName(row: IdeaRow): string {
  const p = Array.isArray(row.people) ? (row.people as IdeaRow["people"][])[0] : row.people;
  return p?.preferred_name || p?.full_name || p?.email || "—";
}
