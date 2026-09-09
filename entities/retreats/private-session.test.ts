import { describe, expect, it } from "vitest";
import {
  BASE_DAYS,
  BASE_PRICE,
  BASE_TEAM_SIZE,
  DAY_OPTIONS,
  DAY_RATE,
  calculateTotal,
  dayUnits,
  isValidDays,
} from "./private-session";

// Pricing is quoted on the page and charged through Stripe from two numbers:
// `calculateTotal` for what the visitor is told, `dayUnits` for the quantity on
// the $1,000 line item. If those two ever disagree, the page and the invoice
// disagree, which is the failure nobody notices until a customer does.
//
// This pins the current behaviour, including what happens outside the offered
// range: neither function validates, and the checkout API is what calls
// `isValidDays` first.

describe("calculateTotal and dayUnits agree across the offered matrix", () => {
  const days = [3, 4, 5];
  const people = [1, 2, 3, 4, 5, 6];

  for (const d of days) {
    for (const n of people) {
      it(`${d} days × ${n} ${n === 1 ? "person" : "people"}`, () => {
        const expectedUnits = (d - BASE_DAYS) + (n - BASE_TEAM_SIZE) * d;
        expect(dayUnits(d, n)).toBe(expectedUnits);
        // The Stripe composition is a $7,000 base plus `dayUnits` × $1,000, so
        // this identity is what keeps checkout equal to the quoted price.
        expect(calculateTotal(d, n)).toBe(BASE_PRICE + DAY_RATE * expectedUnits);
      });
    }
  }

  it("charges the base and nothing else for the smallest booking", () => {
    expect(calculateTotal(3, 1)).toBe(7000);
    expect(dayUnits(3, 1)).toBe(0);
  });

  it("charges the documented figures at the far corner", () => {
    // 7000 + 2 extra days + 5 extra people × 5 days = 7000 + 2000 + 25000.
    expect(calculateTotal(5, 6)).toBe(34_000);
    expect(dayUnits(5, 6)).toBe(27);
  });
});

describe("calculateTotal outside the offered range", () => {
  it("floors the extra-day and extra-person terms rather than discounting", () => {
    // Neither function rejects out-of-range input; both clamp the additive
    // terms at zero, so a bad call over-charges rather than under-charges.
    expect(calculateTotal(2, 1)).toBe(BASE_PRICE);
    expect(calculateTotal(3, 0)).toBe(BASE_PRICE);
    expect(dayUnits(2, 0)).toBe(0);
  });

  it("keeps scaling above the maximum day count", () => {
    expect(calculateTotal(10, 1)).toBe(BASE_PRICE + 7 * DAY_RATE);
  });
});

describe("isValidDays", () => {
  it("accepts exactly the offered day counts", () => {
    for (const d of DAY_OPTIONS) expect(isValidDays(d)).toBe(true);
  });

  it("rejects everything else, including near misses and non-integers", () => {
    for (const d of [0, 1, 2, 6, 3.5, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidDays(d)).toBe(false);
    }
  });
});
