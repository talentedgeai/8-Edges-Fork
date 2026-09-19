import { describe, expect, it } from "vitest";
import { buildOneOnOneIcs } from "./ics";

describe("buildOneOnOneIcs", () => {
  it("writes a timed Saigon event as UTC", () => {
    const ics = buildOneOnOneIcs({ uid: "m1@edge8", dateISO: "2026-09-23", time: "15:00", title: "1-1 with my coach" });
    // 15:00 in Saigon (UTC+7) is 08:00 UTC; 45 minutes by default.
    expect(ics).toContain("DTSTART:20260923T080000Z");
    expect(ics).toContain("DTEND:20260923T084500Z");
    expect(ics).toContain("SUMMARY:1-1 with my coach");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes an all-day event when there is no time", () => {
    const ics = buildOneOnOneIcs({ uid: "m2@edge8", dateISO: "2026-09-23", time: null, title: "1-1" });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260923");
    expect(ics).toContain("DTEND;VALUE=DATE:20260924");
  });

  it("escapes commas, semicolons and newlines in text", () => {
    const ics = buildOneOnOneIcs({ uid: "m3@edge8", dateISO: "2026-09-23", time: null, title: "Goal; plan, next", description: "line one\nline two" });
    expect(ics).toContain("SUMMARY:Goal\; plan\\, next");
    expect(ics).toContain("DESCRIPTION:line one\\nline two");
  });
});
