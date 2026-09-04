// Fails when the count of ESLint warnings for any rule rises above its baseline.
//
// The lint gate (E8-13) fails on errors only; four rules were downgraded to
// "warn" so the gate could turn on, with the promise that each count only goes
// down and a rule is promoted to "error" when it reaches zero. Nothing enforced
// the promise, so this script does (AR-37): it runs `next lint` in JSON mode,
// counts warnings per rule, and compares against scripts/lint-warning-baseline.json.
//
//   node scripts/check-lint-warnings.mjs                  gate
//   node scripts/check-lint-warnings.mjs --write-baseline  lower the baseline to
//                                                          today's counts (refuses
//                                                          to raise any number)
//
// When a rule reaches zero the script says so, because the next step is a human
// one: flip the rule to "error" in .eslintrc.json and delete its baseline entry.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, "..");
export const BASELINE_FILE = "scripts/lint-warning-baseline.json";

/** Count warnings per ruleId in ESLint's JSON formatter output. Errors are the lint gate's job. */
export function countWarnings(results) {
  const counts = {};
  for (const file of results) {
    for (const m of file.messages) {
      if (m.severity !== 1) continue;
      const id = m.ruleId ?? "(no rule)";
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

/** Pure comparison so the test never has to run ESLint. */
export function compareToBaseline(counts, baseline) {
  const errors = [];
  const promotable = [];
  for (const [rule, max] of Object.entries(baseline)) {
    const now = counts[rule] ?? 0;
    if (now > max) errors.push(`${rule}: ${now} warnings, baseline ${max}. Fix the new one; the count only goes down.`);
    if (now === 0) promotable.push(rule);
  }
  for (const [rule, now] of Object.entries(counts)) {
    if (!(rule in baseline)) errors.push(`${rule}: ${now} warning(s) from a rule with no baseline. Fix them or flip the rule to "error".`);
  }
  return { errors, promotable };
}

/** The new baseline, or an error list if any count would rise. */
export function nextBaseline(counts, baseline) {
  const errors = [];
  const next = {};
  for (const [rule, max] of Object.entries(baseline)) {
    const now = counts[rule] ?? 0;
    if (now > max) errors.push(`${rule}: refusing to raise baseline from ${max} to ${now}.`);
    else if (now > 0) next[rule] = now;
  }
  for (const [rule, now] of Object.entries(counts)) {
    if (!(rule in baseline)) errors.push(`${rule}: refusing to add a new rule (${now}) to the baseline.`);
  }
  return { errors, next };
}

export function runLintJson(root) {
  // Ask ESLint to write the JSON to a file rather than reading its stdout: the
  // report for this tree is several hundred KB and, when stdout is a pipe,
  // `next lint` exits before the pipe drains, so a captured stdout stops at
  // 64 KB mid-array. ESLint exits 1 when it reports errors; that is the lint
  // gate's business, so the exit code is ignored here and only the file is read.
  const outFile = path.join(os.tmpdir(), `next-lint-${process.pid}.json`);
  try {
    execFileSync("npx", ["next", "lint", "--format", "json", "--output-file", outFile], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (e) {
    if (!fs.existsSync(outFile)) throw new Error(`next lint failed before writing a report: ${String(e.stderr ?? e.message).slice(0, 300)}`);
  }
  const results = JSON.parse(fs.readFileSync(outFile, "utf8"));
  fs.rmSync(outFile, { force: true });
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = DEFAULT_ROOT;
  const baselinePath = path.join(root, BASELINE_FILE);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).warnings;
  const counts = countWarnings(runLintJson(root));
  if (process.argv.includes("--write-baseline")) {
    const { errors, next } = nextBaseline(counts, baseline);
    if (errors.length) {
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    const file = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    file.warnings = next;
    fs.writeFileSync(baselinePath, JSON.stringify(file, null, 2) + "\n");
    console.log(`baseline lowered: ${JSON.stringify(next)}`);
  } else {
    const { errors, promotable } = compareToBaseline(counts, baseline);
    if (errors.length) {
      console.error(`\n${errors.length} lint-warning regression(s):\n`);
      for (const e of errors) console.error(`  - ${e}`);
      console.error("");
      process.exit(1);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`lint warnings OK: ${total} total, none above baseline.`);
    for (const rule of promotable) {
      console.log(`  ${rule} is at zero: promote it to "error" in .eslintrc.json and drop it from ${BASELINE_FILE}.`);
    }
  }
}
