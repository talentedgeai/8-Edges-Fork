// A calendar file for one 1-1 (K.34). Link-only, like Lark: the page offers a
// download and the member's calendar does the rest; nothing here talks to a
// calendar API, stores a token or syncs anything back.
//
// A date with a time is a timed event in Saigon (UTC+7), written as UTC so any
// client reads it right without a VTIMEZONE block; a date without one is an
// all-day event. Pure and synchronous so the client component can build it
// on click and the test can read the text.

import { addDays } from "@/kernel/config/dates";

export type IcsInput = {
  uid: string;
  dateISO: string;
  // "HH:MM" Saigon wall-clock, or null for an all-day event.
  time: string | null;
  durationMinutes?: number;
  title: string;
  description?: string;
  url?: string;
};

const SAIGON_OFFSET_MINUTES = 7 * 60;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

// RFC 5545 escapes commas, semicolons, backslashes and newlines in text values.
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildOneOnOneIcs(input: IcsInput): string {
  const duration = input.durationMinutes ?? 45;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Edge8//Company OS coaching//EN", "BEGIN:VEVENT", `UID:${input.uid}`];
  if (input.time) {
    const [h, m] = input.time.split(":").map(Number);
    const startMs = Date.parse(`${input.dateISO}T00:00:00Z`) + ((h * 60 + m) - SAIGON_OFFSET_MINUTES) * 60_000;
    lines.push(`DTSTAMP:${utcStamp(startMs)}`, `DTSTART:${utcStamp(startMs)}`, `DTEND:${utcStamp(startMs + duration * 60_000)}`);
  } else {
    const end = addDays(input.dateISO, 1).replace(/-/g, "");
    lines.push(`DTSTAMP:${input.dateISO.replace(/-/g, "")}T000000Z`, `DTSTART;VALUE=DATE:${input.dateISO.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end}`);
  }
  lines.push(`SUMMARY:${escapeText(input.title)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
