"use client";

import { useState } from "react";
import { LEAVE_TYPE_LABEL, type LeaveType } from "@/lib/admin/time-off";
import { formatDate } from "@/lib/admin/format";

// Month-grid calendar for time off, shared by /portal, /team and /admin. Pure
// presentation: it renders exactly the entries it is given, so each surface's
// existing data helper (and its privacy scope) stays the single source of what
// is visible. Approved/taken leave renders solid, pending renders outlined.
export type CalendarEntry = {
  id: string;
  // Person label for the chip. Null on own-leave surfaces (/team), where the
  // leave type is the useful label instead.
  name: string | null;
  leaveType: string;
  status: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isHalfDay: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Only these statuses represent real absence; rejected/cancelled never plot.
const PLOTTED = new Set(["requested", "approved", "taken"]);

type Month = { y: number; m: number }; // m is 0-based

const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKey = ({ y, m }: Month) => `${y}-${pad2(m + 1)}`;
const shift = ({ y, m }: Month, by: number): Month => {
  const t = y * 12 + m + by;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
};

function leaveTypeLabel(type: string): string {
  return LEAVE_TYPE_LABEL[type as LeaveType] ?? type;
}

export function TimeOffCalendar({ entries }: { entries: CalendarEntry[] }) {
  const now = new Date();
  const [month, setMonth] = useState<Month>({ y: now.getFullYear(), m: now.getMonth() });

  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const plotted = entries.filter((e) => PLOTTED.has(e.status));

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  // Monday-first grid offset for the 1st of the month.
  const leading = (new Date(month.y, month.m, 1).getDay() + 6) % 7;

  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey(month)}-${pad2(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="admin-cal-head">
        <div className="admin-cal-month">{MONTHS[month.m]} {month.y}</div>
        <div className="admin-cal-nav">
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            aria-label="Previous month"
            onClick={() => setMonth((v) => shift(v, -1))}
          >
            ←
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}
          >
            Today
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            aria-label="Next month"
            onClick={() => setMonth((v) => shift(v, 1))}
          >
            →
          </button>
        </div>
      </div>

      <div className="admin-cal-scroll">
        <div className="admin-cal-grid">
          {DOW.map((d) => (
            <div key={d} className="admin-cal-dow">{d}</div>
          ))}
          {cells.map((iso, i) => {
            if (iso === null) return <div key={`blank-${i}`} className="admin-cal-day is-blank" />;
            const dow = i % 7; // Monday-first: 5/6 are the weekend
            const dayEntries = plotted.filter((e) => e.startDate <= iso && e.endDate >= iso);
            return (
              <div
                key={iso}
                className={`admin-cal-day${dow >= 5 ? " is-weekend" : ""}${iso === todayIso ? " is-today" : ""}`}
              >
                <div className="admin-cal-date">{Number(iso.slice(8))}</div>
                {dayEntries.map((e) => {
                  const range =
                    e.startDate === e.endDate
                      ? formatDate(e.startDate)
                      : `${formatDate(e.startDate)} → ${formatDate(e.endDate)}`;
                  const person = e.name ? `${e.name} · ` : "";
                  return (
                    <span
                      key={e.id}
                      className={`admin-cal-chip ${e.status === "requested" ? "is-warn" : "is-ok"}`}
                      title={`${person}${leaveTypeLabel(e.leaveType)} · ${range}${e.isHalfDay ? " · half day" : ""} · ${e.status === "requested" ? "pending" : e.status}`}
                    >
                      {e.name ?? leaveTypeLabel(e.leaveType)}
                      {e.isHalfDay ? " ·½" : ""}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-cal-legend">
        <span className="admin-cal-chip is-ok">Approved</span>
        <span className="admin-cal-chip is-warn">Pending</span>
      </div>
    </div>
  );
}
