"use client";

import { useMemo, useState } from "react";
import { DetailDrawer } from "@/components/admin/DetailDrawer";
import { eventStatusBadge } from "./EventStatusBadge";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import Link from "next/link";
import { EVENT_TYPES, EVENT_STATUSES, type EventType, type EventStatus, type EventVisibility } from "@/lib/events";
import { EventManage, type EventAttendee, type EventTierRow } from "./EventManage";

export type EventRow = {
  id: string;
  slug: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  title: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  landingPath: string | null;
  notes: string | null;
  archivedAt: string | null;
  tiers: EventTierRow[];
  attendees: EventAttendee[];
  effectiveAttendees: number;
  registeredCount: number;
  totalCount: number;
  fromUsdCents: number;
  collectedUsdCents: number;
};

const PAGE_SIZES = [25, 50, 100];

function dateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = formatDate(start);
  if (!end || formatDate(end) === s) return s;
  return `${s} → ${formatDate(end)}`;
}

type SortKey =
  | "title"
  | "type"
  | "location"
  | "dates"
  | "registered"
  | "attendees"
  | "from"
  | "collected"
  | "status";

// Numeric/date columns read best largest-first, so they default to descending.
const NUMERIC_KEYS: SortKey[] = ["dates", "registered", "attendees", "from", "collected"];

function sortValue(r: EventRow, k: SortKey): string | number {
  switch (k) {
    case "title":
      return r.title.toLowerCase();
    case "type":
      return r.type;
    case "location":
      return (r.location ?? "").toLowerCase();
    case "dates":
      return r.startsAt ?? "";
    case "registered":
      return r.registeredCount;
    case "attendees":
      return r.effectiveAttendees;
    case "from":
      return r.tiers.length === 0 ? 0 : r.fromUsdCents;
    case "collected":
      return r.collectedUsdCents;
    case "status":
      return r.status;
  }
}

function compareRows(a: EventRow, b: EventRow, k: SortKey, dir: "asc" | "desc"): number {
  const av = sortValue(a, k);
  const bv = sortValue(b, k);
  const c =
    typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
  return dir === "asc" ? c : -c;
}

// Client-owned events table: rows + manage shelf live in one client tree so a
// row click reliably opens the DetailDrawer (see components/admin/DataTable's
// getRowPreview — a server-rendered preview injecting a client shelf never
// opens; same lesson as the retreats and job reqs lists). The catalogue is
// small, so search/type/status filter and paging happen client-side.
export function EventsTable({ rows }: { rows: EventRow[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "archived") {
        if (!r.archivedAt) return false;
      } else {
        if (r.archivedAt) return false;
        if (statusFilter && r.status !== statusFilter) return false;
      }
      if (typeFilter && r.type !== typeFilter) return false;
      if (!query) return true;
      return [r.title, r.location, r.slug].some((v) => (v ? v.toLowerCase().includes(query) : false));
    });
  }, [rows, statusFilter, typeFilter, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const startIdx = (clampedPage - 1) * pageSize;
  const pageRows = sorted.slice(startIdx, startIdx + pageSize);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(NUMERIC_KEYS.includes(k) ? "desc" : "asc");
    }
    setPage(1);
  }

  function sortableTh(label: string, k: SortKey, align?: "right") {
    const active = sortKey === k;
    return (
      <th
        style={align === "right" ? { textAlign: "right" } : undefined}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="admin-btn-reset"
        >
          {label}
          <span aria-hidden className={`admin-sort-arrow${active ? " is-active" : ""}`}>
            {active ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
          </span>
        </button>
      </th>
    );
  }
  const start = total === 0 ? 0 : startIdx + 1;
  const end = Math.min(startIdx + pageSize, total);

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  return (
    <>
      <div className="admin-toolbar u-gap-3 u-wrap">
        <input
          className="admin-input u-max-4"
          placeholder="Search event, location, or slug…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search events"
        />
        <select
          className="admin-select u-max-2"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>
        <select
          className="admin-select u-max-2"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
          <option value="archived">Archived</option>
        </select>
        <select
          className="admin-select u-max-1"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {sortableTh("Event", "title")}
                {sortableTh("Type", "type")}
                {sortableTh("Location", "location")}
                {sortableTh("Dates", "dates")}
                {sortableTh("Registered", "registered", "right")}
                {sortableTh("Attendees", "attendees", "right")}
                {sortableTh("From", "from", "right")}
                {sortableTh("Collected", "collected", "right")}
                {sortableTh("Status", "status")}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="admin-empty">No events match.</div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr
                    key={r.id}
                    className="is-clickable"
                    onClick={() => setSelectedId(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(r.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-haspopup="dialog"
                  >
                    <td>
                      <span className="admin-cell-strong">{r.title}</span>
                    </td>
                    <td>{humanize(r.type)}</td>
                    <td>{r.location || <span className="admin-cell-muted">—</span>}</td>
                    <td>{dateRange(r.startsAt, r.endsAt)}</td>
                    <td className="admin-cell-mono u-right">
                      {r.totalCount > r.registeredCount
                        ? `${r.registeredCount} (${r.totalCount} incl. other)`
                        : String(r.registeredCount)}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {r.effectiveAttendees > 0 ? r.effectiveAttendees : <span className="admin-cell-muted">—</span>}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {r.tiers.length === 0 ? "Free" : formatCents(r.fromUsdCents, "usd")}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {formatCents(r.collectedUsdCents, "usd")}
                    </td>
                    <td>{eventStatusBadge(r.status, r.archivedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="admin-pagination">
            <span>
              {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="admin-pagination-controls">
              <button
                type="button"
                className="admin-pagebtn"
                disabled={clampedPage <= 1}
                onClick={() => setPage(clampedPage - 1)}
              >
                Prev
              </button>
              <span className="admin-pagebtn u-no-events" aria-disabled>
                {clampedPage} / {totalPages}
              </span>
              <button
                type="button"
                className="admin-pagebtn"
                disabled={clampedPage >= totalPages}
                onClick={() => setPage(clampedPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        eyebrow="Event"
        title={selected?.title}
        action={
          selected && (
            <Link href={`/admin/revenue/events/${selected.id}`} className="admin-btn">
              Open event page →
            </Link>
          )
        }
      >
        {selected && <EventManage event={selected} />}
      </DetailDrawer>
    </>
  );
}
