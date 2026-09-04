// Server-only. Anthropic tool definitions for the /team portal assistant.
// The team assistant is answer-only: it has exactly ONE tool, a read-only SQL
// query against the team_chatbot_reader allow-list. No write, email, or portal
// tools exist here (that surface lives only in the admin assistant).

import type Anthropic from "@anthropic-ai/sdk";

export const QUERY_TOOL: Anthropic.Tool = {
  name: "query_database",
  description:
    "Run a single read-only SQL SELECT against the Edge8 Company OS database " +
    "(schema company_os). Use this for every question about company data — " +
    "people, clients, companies, deals and pipeline, invoices, expenses and " +
    "finances, staff and org, time off, events, ideas — and for the company " +
    "knowledge base (the company_information table: policies, values, benefits, " +
    "how-we-work). Also use it to introspect information_schema.columns when " +
    "unsure of a table's columns. You can only read an allow-listed set of " +
    "tables; payroll, compensation, sensitive personal data, recruiting data, " +
    "and survey responses are not readable and will return a permission error. " +
    "Results are capped at 200 rows; add ORDER BY and LIMIT, and aggregate in " +
    "SQL for counts and sums.",
  input_schema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "One SELECT (or WITH) statement. No semicolons.",
      },
    },
    required: ["sql"],
  },
};

export function chatbotTools(): Anthropic.Tool[] {
  return [QUERY_TOOL];
}
