import { beforeEach, describe, expect, it, vi } from "vitest";

// The results page used to fetch survey_answers once per field, so a 30-field
// survey opened 30 connections to render one screen. This pins the batched
// shape: one survey_answers query for every field, keyed back into the same
// per-field buckets (a field with no answers still gets an empty bucket).

type Response = { data?: unknown; error?: { message: string } | null };
const scripts = new Map<string, Response[]>();
const calls: { table: string; ops: string[] }[] = [];

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const record = { table, ops: [] as string[] };
  calls.push(record);
  const respond = () => {
    const queue = scripts.get(table) ?? [];
    const next = queue.shift();
    if (!next) throw new Error(`unscripted query against ${table}`);
    return { data: next.data ?? null, error: next.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "eq", "in", "order", "limit", "maybeSingle"]) {
    builder[op] = () => {
      record.ops.push(op);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
});

describe("SurveyResultsPage", () => {
  it("fetches every field's answers in one query", async () => {
    const fields = Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`,
      survey_id: "s1",
      position: i,
      type: "short_text",
      label: `Q${i}`,
      help_text: null,
      required: false,
      config: null,
    }));
    script("surveys", {
      data: {
        id: "s1",
        slug: "s",
        name: "Survey",
        description: null,
        status: "open",
        is_anonymous: true,
        intro_text: null,
        thank_you_text: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    });
    script("survey_fields", { data: fields });
    script("survey_responses", {
      data: [
        {
          id: "r1",
          respondent_kind: "team",
          respondent_name: null,
          respondent_email: null,
          person_id: null,
          submitted_at: "2026-01-02T00:00:00Z",
          people: null,
        },
      ],
    });
    script("survey_answers", {
      data: [
        { id: "a1", response_id: "r1", field_id: "f0", value: "yes", value_json: null },
        { id: "a2", response_id: "r1", field_id: "f3", value: "no", value_json: null },
      ],
    });

    const { default: SurveyResultsPage } = await import("./page");
    await SurveyResultsPage({ params: { id: "s1" } });

    expect(calls.filter((c) => c.table === "survey_answers")).toHaveLength(1);
    expect(calls.find((c) => c.table === "survey_answers")?.ops).toContain("in");
  });
});
