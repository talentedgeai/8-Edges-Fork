// ME-04 — the htt entity's contract with the composition root.
//
// Design §2: `app/` is thin, and each of its files is a re-export of the body
// that lives in the entity. Two things can silently break that, and this test
// exists for both:
//
//  1. Logic creeps back into the route file. Nothing else would notice — the
//     route keeps working — but the entity stops being the whole of htt.
//  2. The route-segment config is re-exported instead of declared. Next reads
//     `runtime` / `dynamic` / `fetchCache` / `maxDuration` by statically
//     analysing the route module, so a re-exported value is not seen and the
//     handler silently reverts to the defaults: the Edge runtime and a cached
//     response. These handlers hold GitHub sync loops with a five-minute
//     budget, so that failure is total and invisible in code review.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The five app files the tracker owns, and the handlers each must still export. */
const ROUTES = [
  { file: "app/api/htt/backfill/route.ts", handlers: ["POST"] },
  { file: "app/api/cron/htt-sync-prs/route.ts", handlers: ["GET", "POST"] },
  { file: "app/api/cron/htt-ingest-effort-logs/route.ts", handlers: ["GET", "POST"] },
  { file: "app/api/cron/htt-ingest-app-tokens/route.ts", handlers: ["GET", "POST"] },
  { file: "app/api/cron/htt-refresh-summaries/route.ts", handlers: ["GET", "POST"] },
];

/** Route-segment config Next must be able to read off the route module itself. */
const SEGMENT_CONFIG = ["runtime", "dynamic", "fetchCache", "maxDuration"];

function body(file: string): string {
  const source = readFileSync(path.join(root, file), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

describe.each(ROUTES)("$file", ({ file, handlers }) => {
  it("re-exports its handlers from the htt entity", () => {
    const match = body(file).match(/export\s*\{([^}]*)\}\s*from\s*["'](@\/entities\/htt\/[^"']+)["']/);
    expect(match, `${file} does not re-export from @/entities/htt/`).not.toBeNull();
    // `GET as POST` is how the crons keep their manual-trigger alias now that
    // the entity module exports the handler once; the exported name is what the
    // App Router binds to the HTTP method.
    const exported = match![1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/).pop()!.trim())
      .filter(Boolean)
      .sort();
    expect(exported).toEqual([...handlers].sort());
  });

  it("re-exports from a module that exists inside the entity", () => {
    const target = body(file).match(/from\s*["']@\/entities\/(htt\/[^"']+)["']/)![1];
    expect(existsSync(path.join(root, "entities", `${target}.ts`))).toBe(true);
  });

  it("declares its route-segment config literally, not by re-export", () => {
    const text = body(file);
    for (const key of SEGMENT_CONFIG) {
      expect(text, `${file} must declare ${key} itself`).toMatch(
        new RegExp(`export const ${key} = [^;]+;`),
      );
    }
  });

  it("holds nothing but those exports", () => {
    const statements = body(file)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const allowed = /^export (\{[^}]*\} from ["'][^"']+["'];|const \w+ = .+;)$/;
    expect(statements.filter((line) => !allowed.test(line))).toEqual([]);
  });
});
