import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The structured-output API rejects array bounds: minItems other than 0 or 1
// is a 400 ("For 'array' type, 'minItems' values other than 0 or 1 are not
// supported"), which stopped the first real run at the SEO step. Counts live
// in the descriptions and are enforced by the server checks after the call.
describe("writer step schemas", () => {
  it("carry no array bounds the API refuses", () => {
    const dir = __dirname;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((f) => /^step-.*\.ts$/.test(f))) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const m of src.matchAll(/(minItems|maxItems):\s*(\d+)/g)) {
        if (m[1] === "maxItems" || Number(m[2]) > 1) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
