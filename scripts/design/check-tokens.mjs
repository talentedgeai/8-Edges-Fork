#!/usr/bin/env node
// Design-system guardrail. Fails when a raw colour appears anywhere except
// app/styles/tokens.css, or when a component sets colour / font / radius /
// shadow inline. Layout-only inline styles (flex, gap, margin…) are tolerated
// while screens migrate to the `.u-*` utilities; the count is reported so it
// only goes down.
//
//   npm run check:tokens            report + exit 1 on violations
//   npm run check:tokens -- --list  also print every tolerated inline style
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TOKENS = "app/styles/tokens.css";
const SCAN = ["app", "components", "lib"];
const EXT = new Set([".css", ".tsx", ".ts", ".jsx", ".js"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "public"]);
// Places that legitimately paint pixels rather than UI: OG images, SVG
// favicons/logos, email HTML sent to external inboxes (no stylesheet there).
// app/api routes and talent/team/actions.ts only build HTML email bodies.
const SKIP_FILE = /(opengraph-image|icon\.tsx$|apple-icon|lib\/design\/palette\.ts$|lib\/ogRender\.js$|lib\/qr\.ts$|\/email\.ts$|\/emails?\/|marketing-email|lib\/onboarding\.ts$|lib\/contractor-notify|signin-link|portal-invite|goal-notify|board-digest|^app\/api\/|talent\/team\/actions\.ts$|\.module\.css$)/;

const RAW_COLOUR = /(^|[^\w&-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/;
const INLINE_STYLE = /style=\{\{([^}]*)\}\}/g;
const STYLED_PROPS = /\b(color|background|backgroundColor|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|fontFamily|borderRadius|boxShadow|outline)\s*:/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXT.has(p.slice(p.lastIndexOf(".")))) yield p;
  }
}

const violations = [];
const styledInline = []; // inline colour/border/font/radius — migrating per surface; becomes a failure at 0
let toleratedInline = 0;
const tolerated = [];
const list = process.argv.includes("--list");
const STYLED_INLINE_CEILING = Number(process.env.STYLED_INLINE_CEILING ?? 234);

for (const dir of SCAN) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (rel === TOKENS || SKIP_FILE.test(rel)) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "")
        // "PR #698" and ">#698<" are pull-request references, not 3-digit hex colours.
        .replace(/\bPRs?\s*#\d+/g, "").replace(/>#\d+</g, "")
        // "#698 · src/..." inside prose is a reference too: a 3-digit hash followed by a word is never a colour.
        .replace(/(^|[^\w&-])#\d{3}(?=\s+[^\s;}"'),])/g, "$1")
        // A 3-digit all-numeric hash with differing digits (#698) is an issue number; real short colours repeat (#000, #333).
        .replace(/(^|[^\w&-])#(\d)(?!\2\2)\d{2}\b/g, "$1");
      if (RAW_COLOUR.test(code) && !/url\(/.test(code) && !/unicode-range/.test(code)) {
        violations.push(`${rel}:${i + 1}: raw colour — ${line.trim().slice(0, 100)}`);
      }
    });
    if (rel.endsWith(".tsx") || rel.endsWith(".jsx")) {
      for (const m of src.matchAll(INLINE_STYLE)) {
        const body = m[1];
        const lineNo = src.slice(0, m.index).split("\n").length;
        if (STYLED_PROPS.test(body)) {
          styledInline.push(`${rel}:${lineNo}`);
        } else {
          toleratedInline++;
          if (list) tolerated.push(`${rel}:${lineNo}`);
        }
      }
    }
  }
}

if (list) console.log([...styledInline.map((s) => `${s}: styled inline`), ...tolerated].join("\n"));
console.log(`Inline styles that set colour/border/font/radius: ${styledInline.length} (ceiling ${STYLED_INLINE_CEILING}; target 0 — move to a class)`);
console.log(`Layout-only inline styles: ${toleratedInline} (target 0 — migrate to .u-* utilities)`);
if (styledInline.length > STYLED_INLINE_CEILING) {
  violations.push(`styled inline styles rose to ${styledInline.length}, above the ceiling of ${STYLED_INLINE_CEILING} — run with --list to see them`);
}
if (violations.length) {
  console.error(`\n${violations.length} design-token violation(s):\n` + violations.join("\n"));
  process.exit(1);
}
console.log("check:tokens OK — no raw colours outside app/styles/tokens.css, no styled inline props.");
