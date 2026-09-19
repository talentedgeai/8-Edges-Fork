// Would the tree as it stands leave for the public fork? Stage it the way the
// mirror does and run the content scanner over the result, locally and in CI,
// before a merge rather than after one.
//
// Why: the mirror runs nightly against main and fails closed, which protects
// the fork but blocks it. PR #1273 wrote a private-library path into a shared
// UI component; nothing before the merge looked, the mirror refused the tree,
// and every later sync was blocked until someone noticed. Both scripts are the
// mirror's own (stage-fork-tree.sh, scan-tree.sh), so this answers exactly the
// question the workflow will ask.
//
//   npm run check:fork-safe
//
// Exit 1 with the scanner's report when the tree may not leave.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = mkdtempSync(join(tmpdir(), "fork-safe-"));
try {
  const staged = spawnSync("bash", [join(ROOT, ".github/scripts/stage-fork-tree.sh"), dest, ROOT], { encoding: "utf8" });
  if (staged.status !== 0) {
    process.stderr.write(staged.stderr || staged.stdout);
    console.error("check-fork-safe: could not stage the fork tree.");
    process.exit(1);
  }
  const scan = spawnSync("bash", [join(ROOT, ".github/scripts/scan-tree.sh"), dest, "--allow-published-marketing"], { encoding: "utf8" });
  const out = `${scan.stdout}${scan.stderr}`.replace(/^::error::/gm, "");
  if (scan.status !== 0) {
    process.stderr.write(out);
    console.error(
      "\ncheck-fork-safe: this tree would be refused by the fork sync. Fix the lines above before merging: a private route or",
      "internal value belongs in a module the fork overlay stubs (see entities/org/lib/onboarding-deck.ts), or in a path on",
      ".github/fork-sync-exclude.txt.",
    );
    process.exit(1);
  }
  console.log("check-fork-safe: the staged fork tree passes the content scanner.");
} finally {
  rmSync(dest, { recursive: true, force: true });
}
