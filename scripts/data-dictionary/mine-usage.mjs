// Mines "where is this table/column used" evidence from the codebase into
// scripts/data-dictionary/column-usage.json, which generate.mjs folds into the
// atlas Dictionary tab. Mechanical and re-runnable; never hand-edit the JSON.
//
//   node scripts/data-dictionary/mine-usage.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// lib/ and components/ went with ME-13; product code is under entities/ and kernel/.
const ROOTS = ["app", "entities", "kernel", "scripts", "supabase/functions"];
const EXT = /\.(ts|tsx|mjs|js|sql)$/;
const IGNORE = /node_modules|\.next|scripts\/data-dictionary/;

// table -> [column names] parsed from the dictionary's atlas data
const atlas = readFileSync("private-docs/workflows/private/e8/data-atlas.html", "utf8");
const DATA = JSON.parse(atlas.match(/const DATA = (\{[\s\S]*?\});\n/)[1]);
// canonical names for renamed cards
const RENAME = { marketing_calendar: "marketing_content", compensation: "compensation_sensitive", team_knowledge: "company_information", meeting_links: "meeting_associations", coaching_goals: "goals" };
const DROPPED = new Set(["meeting_notes", "goals", "campaigns"]);
const tables = {};
for (const [k, v] of Object.entries(DATA.tables)) {
  if (DROPPED.has(k) && !RENAME[k]) continue;
  const name = RENAME[k] ?? k;
  tables[name] = v.cols.map((c) => c[0]);
}

const files = [];
const walk = (d) => {
  let items;
  try { items = readdirSync(d); } catch { return; }
  for (const it of items) {
    const p = join(d, it);
    if (IGNORE.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXT.test(it)) files.push(p);
  }
};
ROOTS.forEach(walk);

// A file "uses" a table if it references it via supabase .from(), a qualified
// SQL name, or a bare quoted name in SQL-ish context. Old names count for
// renamed tables (deploy-coupled code may still use them).
const OLD_OF = Object.fromEntries(Object.entries(RENAME).map(([o, n]) => [n, o]));
const usage = {};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const [t, cols] of Object.entries(tables)) {
    const bare = t.startsWith("htt.") ? t.slice(4) : t;
    const names = [bare];
    if (OLD_OF[t]) names.push(OLD_OF[t]);
    const hit = names.some((n) =>
      src.includes(`from("${n}")`) || src.includes(`from('${n}')`) ||
      src.includes(`company_os.${n}`) || src.includes(`htt.${n}`) ||
      new RegExp(`["'\`]${n}["'\`]\\s*(?:as|;|\\)|,|\\n)`).test(src) && /select|insert|update|delete|join/i.test(src)
    );
    if (!hit) continue;
    usage[t] ??= { files: [], cols: {} };
    usage[t].files.push(f);
    for (const c of cols) {
      if (["id", "created_at", "updated_at"].includes(c)) continue;
      if (new RegExp(`\\b${c}\\b`).test(src)) (usage[t].cols[c] ??= []).push(f);
    }
  }
}
for (const t of Object.values(usage)) {
  t.files = [...new Set(t.files)].sort();
  for (const c of Object.keys(t.cols)) t.cols[c] = [...new Set(t.cols[c])].sort();
}
writeFileSync("scripts/data-dictionary/column-usage.json", JSON.stringify(usage, null, 1));
const nt = Object.keys(usage).length;
const nc = Object.values(usage).reduce((a, t) => a + Object.keys(t.cols).length, 0);
console.log(`Mined ${nt} tables with code references, ${nc} column-usage mappings, from ${files.length} source files.`);
