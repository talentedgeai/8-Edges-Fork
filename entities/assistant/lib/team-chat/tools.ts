// Server-only. Anthropic tool definitions for the /team portal assistant.
// The team assistant is answer-only, with one deliberate exception: a read-only
// SQL query against the team_chatbot_reader allow-list for everyone, plus
// request_review_link for the people who may add reviewers to a performance
// review (admins, the talent director, managers). No general write, email, or
// portal tools exist here (that surface lives only in the admin assistant).

import type Anthropic from "@anthropic-ai/sdk";

export const QUERY_TOOL: Anthropic.Tool = {
  name: "query_database",
  description:
    "Run a single read-only SQL SELECT against the Arca Wellness Company OS database " +
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

export const REVIEW_LINK_TOOL: Anthropic.Tool = {
  name: "request_review_link",
  description:
    "Add one or more reviewers to a team member's performance or probation " +
    "review and get a link for each. Use it when someone asks for a review " +
    "link, wants a client contact, a second lead, or a peer to review " +
    "someone, or wants to start a review. The subject's open cycle is used, " +
    "or one is opened (probation for someone on probation, otherwise ad hoc) " +
    "with their self-assessment and manager review. A reviewer given by email " +
    "who is a team member becomes a team reviewer; any other email becomes an " +
    "external reviewer who needs no account, the link is theirs alone. A " +
    "reviewer given by name only must be a team member. The tool refuses " +
    "when the caller may not add reviewers for that person, when the subject " +
    "name is ambiguous, or when a reviewer cannot be resolved; relay its " +
    "message and ask. Links are returned for you to show; nothing is emailed " +
    "unless the person explicitly asked you to send it (then set send).",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "The team member being reviewed: name or @edge8.ai email." },
      reviewers: {
        type: "array",
        description: "Who should review. Each needs a name, an email, or both.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
        },
      },
      send: {
        type: "boolean",
        description: "Email each reviewer their link now. Only when asked in so many words.",
      },
    },
    required: ["subject", "reviewers"],
  },
};

export function chatbotTools(opts: { canRequestReviews: boolean } = { canRequestReviews: false }): Anthropic.Tool[] {
  return opts.canRequestReviews ? [QUERY_TOOL, REVIEW_LINK_TOOL] : [QUERY_TOOL];
}
