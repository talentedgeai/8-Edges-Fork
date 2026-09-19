import { describe, expect, it } from "vitest";
import { validatePreferredSlot } from "./preferred-slot";

describe("validatePreferredSlot", () => {
  it("accepts a weekday and a 24-hour time, or nothing at all", () => {
    expect(validatePreferredSlot({ weekday: 3, time: "15:00" })).toEqual({ ok: true });
    expect(validatePreferredSlot({ weekday: null, time: null })).toEqual({ ok: true });
    expect(validatePreferredSlot({ weekday: 1, time: null })).toEqual({ ok: true });
  });
  it("refuses weekends and malformed times", () => {
    expect(validatePreferredSlot({ weekday: 0, time: null }).ok).toBe(false);
    expect(validatePreferredSlot({ weekday: 6, time: null }).ok).toBe(false);
    expect(validatePreferredSlot({ weekday: 3, time: "3pm" }).ok).toBe(false);
    expect(validatePreferredSlot({ weekday: 3, time: "24:00" }).ok).toBe(false);
  });
});
