import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The `@` alias mirrors `paths` in tsconfig.json (`@/*` → `./*`) so tests
// import modules exactly as application code does. `video/` is a separate
// package with its own `*.spec.ts` files and must never be collected here.
export default defineConfig({
  // tsconfig.json keeps `jsx: "preserve"` for the Next compiler, so the test
  // transformer has to be told to compile JSX itself. Without this the
  // `app/**/*.test.tsx` boundary tests fail to parse. (vitest 4 ships
  // rolldown-vite, whose transformer is oxc, not esbuild.)
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      // The shared kernel (ME-03) keeps its tests beside the modules, like lib/.
      "kernel/**/*.test.{ts,tsx}",
      // `.tsx` matters: the route-boundary tests render real components, and an
      // `app/**/*.test.ts` pattern silently skips every one of them.
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
      // The fork-sync guard lives beside the scripts it exercises, inside
      // .github/ — which is excluded from the sync wholesale, so the test does
      // not ship to the fork it is testing.
      ".github/scripts/**/*.test.mjs",
    ],
    exclude: ["video/**", "node_modules/**"],
  },
});
