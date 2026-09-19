// The moment a goal moves (K.41). When the news comes in, the member opens
// the page and bumps the number right where the goal lives; this is the line
// the page says back. About the goal and its target, never a rank, never a
// comparison with anyone else, and never a scold when the number goes down.

export type GoalMoment = { headline: string; detail: string; tone: "up" | "flat" | "down" | "landed" | "halfway" };

// A goal has exactly two moments (Khoa, 2026-09-17): half the way and the whole
// way. Half is the one this rule has to find, because unlike the target it is
// not a number anyone typed — it is a line the bump crossed. It is a crossing,
// not a state: the bump that takes 90 to 110 of 200 says "Halfway", and every
// later bump above the line says only what it moved, because a milestone that
// repeats is a tally and a tally about someone's own goal is a nag.
function crossedHalf(before: number, after: number, target: number | null): boolean {
  if (target === null || target <= 0) return false;
  return before / target < 0.5 && after / target >= 0.5;
}

export function goalMoment(input: {
  before: number | null;
  after: number;
  target: number | null;
  unit: string | null;
}): GoalMoment {
  const unit = input.unit ? ` ${input.unit}` : "";
  const before = input.before ?? 0;
  const delta = input.after - before;
  const pct = input.target && input.target > 0 ? Math.round((input.after / input.target) * 100) : null;
  if (input.target !== null && input.after >= input.target) {
    return {
      headline: `${input.after}${unit}. That is the goal.`,
      detail: "Landed. Say it in your next 1-1, then pick what comes after this.",
      tone: "landed",
    };
  }
  if (delta > 0 && crossedHalf(before, input.after, input.target)) {
    return {
      headline: `Halfway. ${input.after} of ${input.target}${unit}.`,
      detail: `${pct}% of the way, from where you started. ${remaining(input.target! - input.after, input.unit)}`,
      tone: "halfway",
    };
  }
  if (delta > 0) {
    return {
      headline: `${before} → ${input.after}${unit}`,
      detail: pct !== null ? `${pct}% of the way. ${remaining(input.target! - input.after, input.unit)}` : "Moving.",
      tone: "up",
    };
  }
  if (delta < 0) {
    return {
      headline: `${before} → ${input.after}${unit}`,
      detail: "Numbers move both ways. Worth a line in your next 1-1 about what changed.",
      tone: "down",
    };
  }
  return { headline: `Still ${input.after}${unit}`, detail: "No change is a fact too.", tone: "flat" };
}

function remaining(n: number, unit: string | null): string {
  return `${n}${unit ? ` ${unit}` : ""} to go.`;
}
