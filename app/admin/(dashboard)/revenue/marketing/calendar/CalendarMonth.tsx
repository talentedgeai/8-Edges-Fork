"use client";

import { useState } from "react";
import {
  CHANNEL_LABEL,
  CHANNEL_ACCENT,
  STATUS_LABEL,
  type CalendarEntryRow,
} from "@/lib/admin/marketing-calendar";

// Month grid for the marketing calendar, mechanics copied from TimeOffCalendar:
// Monday-first, leading-blank padding, pad to a multiple of 7. Chips are single
// entries on their publish_date, tinted by channel. Click opens the shared
// entry drawer.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Month = { y: number; m: number }; // m is 0-based
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKey = ({ y, m }: Month) => `${y}-${pad2(m + 1)}`;
const shift = ({ y, m }: Month, by: number): Month => {
  const t = y * 12 + m + by;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
};

export function CalendarMonth({
  entries,
  onSelect,
}: {
  entries: CalendarEntryRow[];
  onSelect: (id: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState<Month>({ y: now.getFullYear(), m: now.getMonth() });

  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const dated = entries.filter((e) => e.publishDate);

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
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
            const dow = i % 7;
            const dayEntries = dated.filter((e) => e.publishDate === iso);
            return (
              <div
                key={iso}
                className={`admin-cal-day${dow >= 5 ? " is-weekend" : ""}${iso === todayIso ? " is-today" : ""}`}
              >
                <div className="admin-cal-date">{Number(iso.slice(8))}</div>
                {dayEntries.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="admin-cal-chip admin-cal-chip--solid"
                    style={{ background: CHANNEL_ACCENT[e.channel] }} /* layout-ok: channel accent is a token var chosen at runtime */
                    title={`${e.title} · ${CHANNEL_LABEL[e.channel]}${e.brandName ? ` · ${e.brandName}` : ""} · ${STATUS_LABEL[e.status]}`}
                    onClick={() => onSelect(e.id)}
                  >
                    {e.parentId ? "↳ " : ""}{e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-cal-legend">
        {Object.entries(CHANNEL_LABEL).map(([id, label]) => (
          <span
            key={id}
            className="admin-cal-chip admin-cal-chip--solid"
            style={{ background: CHANNEL_ACCENT[id as keyof typeof CHANNEL_ACCENT] }} /* layout-ok: channel accent is a token var chosen at runtime */
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
