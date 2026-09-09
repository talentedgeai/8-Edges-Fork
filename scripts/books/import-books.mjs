// One-time import of the three AIO books from the aio-website working repo
// into company_os.books / book_chapters. Idempotent: re-running replaces each
// book's chapters. Usage, from the repo root:
//   node scripts/books/import-books.mjs /path/to/aio-website
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const db = createClient(envVar('SUPABASE_URL'), envVar('SUPABASE_SECRET_KEY'), {
  db: { schema: 'company_os' },
});

const aio = process.argv[2];
if (!aio || !fs.existsSync(path.join(aio, 'docs/book'))) {
  console.error('Pass the aio-website repo path (must contain docs/book/)');
  process.exit(1);
}

const AIO_BRAND = '653a8562-835f-4c1b-a51a-1ab989d563ac'; // AI Officer Institute

const read = (...p) => fs.readFileSync(path.join(aio, 'docs/book', ...p), 'utf8');

// First markdown heading in the file that isn't a bare part marker (chapter
// files that open a new part carry "# Part I: Lost" above the chapter heading);
// fallback to filename.
function headingTitle(md, file) {
  for (const m of md.matchAll(/^#{1,3}\s+(.+)$/gm)) {
    const t = m[1].trim();
    if (!/^Part [IVX]+/.test(t)) return t;
  }
  return path.basename(file, '.md').replace(/^\d+-/, '').replace(/-/g, ' ');
}

function dirChapters(dir, part) {
  return fs
    .readdirSync(path.join(aio, 'docs/book', dir))
    .filter((f) => f.endsWith('.md') && !/^README/i.test(f))
    .sort()
    .map((f) => {
      const md = read(dir, f);
      return { part, title: headingTitle(md, f), body_md: md.trim() };
    });
}

// The Other 50% field guide: manuscript-v2, numbered chapter files.
const V2_PARTS = {
  0: 'Opening', 1: 'Part I: Lost', 2: 'Part I: Lost', 3: 'Part I: Lost',
  4: 'Part II: The Craft', 5: 'Part II: The Craft', 6: 'Part II: The Craft', 7: 'Part II: The Craft',
  8: 'Part III: Altitudes', 9: 'Part III: Altitudes', 10: 'Part III: Altitudes',
  11: 'Close', 12: 'Appendix',
};
const fieldGuideChapters = fs
  .readdirSync(path.join(aio, 'docs/book/manuscript-v2'))
  .filter((f) => /^\d\d-/.test(f))
  .sort()
  .map((f) => {
    const md = read('manuscript-v2', f);
    return { part: V2_PARTS[Number(f.slice(0, 2))] ?? null, title: headingTitle(md, f), body_md: md.trim() };
  });

// The fable: 35 micro-chapters across five part folders, plus The Model appendix.
const FABLE_PARTS = [
  ['part-1-the-big-get', 'Part One: The Big Get'],
  ['part-2-the-night-the-fight-broke-out', 'Part Two: The Night the Fight Broke Out'],
  ['part-3-the-aftermath', 'Part Three: The Aftermath'],
  ['part-4-the-path-forward', 'Part Four: The Path Forward'],
  ['part-5-the-price', 'Part Five: The Price'],
];
const fableChapters = FABLE_PARTS.flatMap(([dir, part]) => dirChapters(path.join('fable', dir), part));
{
  const md = read('fable', 'the-model.md');
  fableChapters.push({ part: 'Appendix', title: headingTitle(md, 'the-model.md'), body_md: md.trim() });
}

// The CHRO edition: one file, split on level-1 headings. Bare "Part N" sections
// become the part label for the chapters that follow them.
const chroChapters = [];
{
  const full = read('manuscript-chro', 'workflow-design-chro-full-book.md');
  const sections = full.split(/^(?=# )/m).slice(1); // drop the front matter before the first "# "
  let part = null;
  for (const s of sections) {
    const title = s.match(/^# (.+)$/m)[1].trim();
    const body = s.replace(/^# .+\n/, '').trim();
    if (/^Part [IVX]+/.test(title) && body.length < 200) { part = title; continue; }
    if (title === 'Workflow Design') continue; // title page
    chroChapters.push({ part, title, body_md: s.trim() });
  }
}

const BOOKS = [
  {
    slug: 'the-other-50',
    title: 'The Other 50%',
    subtitle: 'Workflow Design: A Field Guide to the Other 50% of Leadership',
    format: 'nonfiction',
    audience: 'Founders and C-level executives',
    description:
      'The short, practical field guide to the second half of leadership: designing workflows, organizing company knowledge, and writing instructions for AI. V2 manuscript (lighter voice); V1 remains the factual source of truth.',
    reader_path: '/books/the-other-50.html',
    status: 'published_web',
    sort_order: 1,
    chapters: fieldGuideChapters,
  },
  {
    slug: 'the-night-the-fight-broke-out',
    title: 'The Night the Fight Broke Out',
    subtitle: 'A Leadership Fable About the Half Nobody Was Trained For',
    format: 'fable',
    audience: 'Founders and C-level executives',
    description:
      'The story companion to The Other 50%. A VIP party booked on a handshake ends in a lawsuit that exposes that nothing about how the company runs exists outside the owner\'s head. Five parts, 35 micro-chapters, plus The Model appendix.',
    reader_path: '/books/the-night-the-fight-broke-out.html',
    status: 'published_web',
    sort_order: 2,
    chapters: fableChapters,
  },
  {
    slug: 'the-most-underbuilt-office',
    title: 'The Most Underbuilt Office',
    subtitle: "Workflow Design: The Talent Leader's Field Guide, CHRO Edition",
    format: 'nonfiction',
    audience: 'CHROs and talent leaders',
    description:
      'The CHRO edition of the Workflow Design field guide: the same three skills and altitudes, reframed for the leader who owns talent and is watching the req list grow while nothing about how work happens is written down.',
    reader_path: '/books/the-most-underbuilt-office.html',
    status: 'published_web',
    sort_order: 3,
    chapters: chroChapters,
  },
];

for (const b of BOOKS) {
  const { chapters, ...book } = b;
  const { data: row, error } = await db
    .from('books')
    .upsert({ brand_id: AIO_BRAND, ...book }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (error) throw error;
  const del = await db.from('book_chapters').delete().eq('book_id', row.id);
  if (del.error) throw del.error;
  const ins = await db
    .from('book_chapters')
    .insert(chapters.map((c, i) => ({ book_id: row.id, sort_order: i + 1, ...c })));
  if (ins.error) throw ins.error;
  console.log(`${b.slug}: ${chapters.length} chapters`);
}
