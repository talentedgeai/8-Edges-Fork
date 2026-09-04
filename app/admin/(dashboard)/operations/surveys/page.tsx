import Link from "next/link";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/admin/Badge";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { listEntity, countEntity } from "@/lib/admin/query";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { formatDate } from "@/lib/admin/format";
import { surveyStatusTone } from "@/lib/admin/surveys";
import { PERFORMANCE_REVIEW_SLUGS } from "@/lib/reviews";
import { NewSurveyButton } from "./NewSurveyButton";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  slug: string;
  name: string;
  status: string;
  updated_at: string;
  response_count: number;
  last_response_at: string | null;
};

const BASE = "/admin/operations/surveys";
const SORTABLE = ["name", "status", "updated_at", "response_count", "last_response_at"];
// A survey counts as having "new" responses if its latest one landed within a week.
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: SearchParamsObj;
}) {
  const sort = firstParam(searchParams.sort) ?? "updated_at";
  const dir = (firstParam(searchParams.dir) as "asc" | "desc" | undefined) ?? "desc";

  // The performance-review capture forms (perf-review-self/manager) are surveys
  // by storage but managed entirely through the review flow — their answers go
  // to performance_reviews, never survey_responses, so they'd always read
  // "Results (0)" here. Hide them from the list and the counts; they stay
  // reachable by direct URL for editing.
  const hiddenSlugs = [...PERFORMANCE_REVIEW_SLUGS];

  const [list, total, published, responses] = await Promise.all([
    listEntity<Row>(
      "survey_list",
      "id, slug, name, status, updated_at, response_count, last_response_at",
      {
        page: Number(firstParam(searchParams.page) ?? 1),
        search: firstParam(searchParams.q),
        searchColumns: ["name", "slug"],
        sort: SORTABLE.includes(sort) ? sort : "updated_at",
        dir,
        excludeArchived: true,
        exclude: { slug: hiddenSlugs },
      },
    ),
    countEntity("surveys", {}, { slug: hiddenSlugs }),
    countEntity("surveys", { status: "published" }, { slug: hiddenSlugs }),
    countEntity("survey_responses"),
  ]);

  const isRecent = (ts: string | null) =>
    !!ts && Date.now() - new Date(ts).getTime() < NEW_WINDOW_MS;

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Survey",
      sortable: true,
      cell: (r) => (
        <Link href={`${BASE}/${r.id}`} className="admin-cell-strong">
          {r.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => <Badge tone={surveyStatusTone(r.status)}>{r.status}</Badge>,
    },
    {
      key: "response_count",
      header: "Responses",
      align: "right",
      sortable: true,
      cell: (r) => <span className="admin-cell-mono">{r.response_count}</span>,
    },
    {
      key: "last_response_at",
      header: "Last response",
      sortable: true,
      cell: (r) => (
        <span className="u-row">
          {formatDate(r.last_response_at)}
          {isRecent(r.last_response_at) && (
            <Badge tone="ok" dot>
              new
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "updated_at",
      header: "Updated",
      sortable: true,
      cell: (r) => formatDate(r.updated_at),
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <span className="u-row">
          <Link className="admin-btn admin-btn--sm" href={`${BASE}/${r.id}/results`}>
            Results
          </Link>
          {r.status === "published" && (
            <a
              className="admin-btn admin-btn--sm"
              href={`/surveys/${r.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Open ↗
            </a>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Operations · Workplace"
        title="Surveys"
        sub="Light Typeform: build, share, and read team and external surveys."
        action={<NewSurveyButton />}
      />

      {list.error && <div className="admin-alert admin-alert--err">{list.error}</div>}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Surveys" value={total} />
        <MetricCard label="Published" value={published} />
        <MetricCard label="Responses" value={responses} />
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={sort}
        dir={dir}
        basePath={BASE}
        searchParams={searchParams}
        searchPlaceholder="Search surveys…"
        emptyText="No surveys yet. Create the first one."
      />
    </>
  );
}
