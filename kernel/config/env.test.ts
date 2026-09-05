import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envFlag, optionalEnv, requireEnv } from "./env";

const NAME = "E8_15_TEST_VARIABLE";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv(NAME, "value");
    expect(requireEnv(NAME)).toBe("value");
  });

  it("throws a message that names the variable when unset", () => {
    vi.stubEnv(NAME, undefined);
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
  });

  it("treats an empty string as unset", () => {
    vi.stubEnv(NAME, "");
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
  });
});

describe("optionalEnv", () => {
  it("returns undefined for unset and empty values", () => {
    vi.stubEnv(NAME, undefined);
    expect(optionalEnv(NAME)).toBeUndefined();
    vi.stubEnv(NAME, "");
    expect(optionalEnv(NAME)).toBeUndefined();
  });

  it("returns the value when set", () => {
    vi.stubEnv(NAME, "x");
    expect(optionalEnv(NAME)).toBe("x");
  });
});

describe("envFlag", () => {
  it("falls back to the default when unset", () => {
    vi.stubEnv(NAME, undefined);
    expect(envFlag(NAME)).toBe(false);
    expect(envFlag(NAME, true)).toBe(true);
  });

  it.each(["1", "true", "TRUE", "yes", " on "])("reads %j as true", (raw) => {
    vi.stubEnv(NAME, raw);
    expect(envFlag(NAME)).toBe(true);
  });

  it.each(["0", "false", "No", "off"])("reads %j as false", (raw) => {
    vi.stubEnv(NAME, raw);
    expect(envFlag(NAME, true)).toBe(false);
  });

  it("returns the default for an unrecognised spelling", () => {
    vi.stubEnv(NAME, "maybe");
    expect(envFlag(NAME, true)).toBe(true);
    expect(envFlag(NAME, false)).toBe(false);
  });
});

// `.env.example` is the one place every variable the app reads is listed. This
// keeps it honest: any `process.env` read in app/, entities/, kernel/ or middleware.ts must
// have a matching line. The example may list MORE names than the code reads
// (a ticket can document a variable before its code merges), never fewer.
describe(".env.example", () => {
  // This file lives at kernel/config/, two levels below the repo root (ME-03).
  const root = join(__dirname, "..", "..");

  function walk(dir: string, out: string[]): void {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full);
    }
  }

  function namesReadByCode(): Set<string> {
    const files: string[] = [];
    walk(join(root, "app"), files);
    walk(join(root, "entities"), files);
    walk(join(root, "kernel"), files);
    files.push(join(root, "middleware.ts"));
    const names = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        names.add(match[1]);
      }
    }
    return names;
  }

  function exampleLines(): string[] {
    return readFileSync(join(root, ".env.example"), "utf8").split("\n");
  }

  function namesInExample(): Set<string> {
    const names = new Set<string>();
    for (const line of exampleLines()) {
      const match = /^([A-Z0-9_]+)=/.exec(line);
      if (match) names.add(match[1]);
    }
    return names;
  }

  it("lists every variable the code reads", () => {
    const missing = [...namesReadByCode()].filter((n) => !namesInExample().has(n)).sort();
    expect(missing, `add these to .env.example: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries names only, never values", () => {
    const withValues = exampleLines().filter((line) => /^[A-Z0-9_]+=.+/.test(line));
    expect(withValues).toEqual([]);
  });

  it("does not list a name twice", () => {
    const seen = new Map<string, number>();
    for (const line of exampleLines()) {
      const match = /^([A-Z0-9_]+)=/.exec(line);
      if (match) seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1).map(([name]) => name)).toEqual([]);
  });
});
