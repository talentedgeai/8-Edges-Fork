// Phase 2a: ingest the static AI Officer blog corpus into the shared marketing DB
// under brand = ai-officer, one marketing_content (channel=blog, published) row per
// post + one marketing_campaigns per post (same reversible tag as Phase 1).
// Both ai-officer.com and aiolabz.com will later read these rows (2b/2c).
//
// Source: aio-website/public/post/*.html (the superset; aiolabz shares the slugs).
// Idempotent by slug. Dry-run by default; --commit writes.
//
//   node scripts/ingest-aio-blog.mjs            # dry run (parse + print)
//   node scripts/ingest-aio-blog.mjs --commit   # write

import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = '/Users/davepro/code-projects/edge8-web/.env.local';
const POSTS_DIR = '/Users/davepro/code-projects/aio-website/public/post';
const SITEMAP = '/Users/davepro/code-projects/aio-website/public/sitemap.xml';
const BACKFILL_TAG = 'backfill-2026-08-30';
const AIO_BRAND = '653a8562-835f-4c1b-a51a-1ab989d563ac';
const COMMIT = process.argv.includes('--commit');

const env = fs.readFileSync(ENV_PATH, 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
const URL = pick('SUPABASE_URL');
const KEY = pick('SUPABASE_SECRET_KEY');
const base = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rest = (p, init = {}) => fetch(`${URL}/rest/v1/${p}`, { ...init, headers: { ...base, ...(init.headers || {}) } });

// ── extraction helpers (templated static pages, consistent structure) ──
const decode = (s) =>
  s?.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·').replace(/&mdash;/g, ',').replace(/&ndash;/g, '-')
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&hellip;/g, '…').trim();

// slug -> lastmod date, the reliable publish date for posts whose HTML has no JSON-LD date.
const sitemap = fs.readFileSync(SITEMAP, 'utf8');
const sitemapDate = {};
for (const m of sitemap.matchAll(/\/post\/([^<]+)<\/loc><lastmod>([^<]+)</g)) sitemapDate[m[1]] = m[2].slice(0, 10);
const stripTags = (s) => decode(s?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
const attr = (html, re) => html.match(re)?.[1] ?? null;
const slugify = (s) =>
  s?.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;

function parsePost(file) {
  const html = fs.readFileSync(file, 'utf8');
  const slug = path.basename(file, '.html');

  const title = stripTags(html.match(/<h1 class="post-title">([\s\S]*?)<\/h1>/)?.[1]);
  const category = stripTags(html.match(/<div class="post-category">([\s\S]*?)<\/div>/)?.[1]);
  const titleTag = decode(attr(html, /<title>([^<]*)<\/title>/));
  const metaDesc = decode(attr(html, /<meta name="description" content="([^"]*)"/));
  const image = attr(html, /<meta property="og:image" content="([^"]*)"/);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  const date = attr(html, /"datePublished":\s*"([^"]+)"/) || sitemapDate[slug] || null;
  const readMin = html.match(/([0-9]+)\s*min read/i)?.[1] ?? null;

  // Body = inner content, up to the author bio / related / footer. Two template
  // variants exist: post-body-inner (most) and post-content (a few, e.g. leadership).
  let start = html.indexOf('<div class="post-body-inner">');
  if (start < 0) start = html.indexOf('<div class="post-content"');
  if (start < 0) start = html.indexOf('<div class="post-body">');
  start = html.indexOf('>', start) + 1;
  let end = html.indexOf('<div class="author-note"', start);
  if (end < 0) end = html.indexOf('<section class="related-section"', start);
  if (end < 0) end = html.indexOf('<footer', start);
  let body = html.slice(start, end < 0 ? undefined : end).trim();
  body = body.replace(/(\s*<\/div>)+\s*$/, '').trim(); // drop trailing wrapper closes

  return {
    slug,
    title,
    category,
    category_slug: slugify(category),
    title_tag: titleTag,
    meta_description: metaDesc,
    excerpt: metaDesc,
    image_url: image,
    posted_url: canonical || `https://www.ai-officer.com/post/${slug}`,
    publish_date: date,
    read_time: readMin ? Number(readMin) : null,
    body_html: body || null,
  };
}

// ── run ──
const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.html')).sort();
const posts = files.map((f) => parsePost(path.join(POSTS_DIR, f)));

// All existing ai-officer blog rows: match by slug, posted_url, or title so the
// slug-null rows already in the OS get normalized in place instead of duplicated.
const existing = await rest(
  `marketing_content?select=id,slug,posted_url,title,campaign_id&brand_id=eq.${AIO_BRAND}&channel=eq.blog`,
  { headers: { 'Accept-Profile': 'company_os' } },
).then((r) => r.json());
const existingRows = Array.isArray(existing) ? existing : [];
const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const findExisting = (p) =>
  existingRows.find(
    (e) =>
      (e.slug && e.slug === p.slug) ||
      (e.posted_url && e.posted_url.replace(/\/$/, '').endsWith(`/${p.slug}`)) ||
      (e.title && norm(e.title) === norm(p.title)),
  );

let nNew = 0, nUpd = 0;
console.log(`Parsed ${posts.length} static AIO posts from ${POSTS_DIR}\n`);
console.log('   #  date        body    action   slug  (category)');
posts.forEach((p, i) => {
  const ex = findExisting(p);
  ex ? nUpd++ : nNew++;
  const warn = !p.title || !p.body_html || !p.publish_date ? '  ⚠ missing field' : '';
  console.log(
    `${String(i + 1).padStart(4)}  ${(p.publish_date ?? '    ?     ').padEnd(10)}  ` +
      `${String(p.body_html?.length ?? 0).padStart(5)}c  ${(ex ? 'update' : 'INSERT').padEnd(7)}  ${p.slug}  (${p.category ?? '—'})${warn}`,
  );
});
console.log(`\n${nNew} to insert, ${nUpd} existing rows to normalize.`);

if (!COMMIT) {
  console.log('\nDRY RUN. Re-run with --commit to write.');
  process.exit(0);
}

const contentFields = (p) => ({
  title: p.title, slug: p.slug, posted_url: p.posted_url,
  title_tag: p.title_tag, meta_description: p.meta_description, excerpt: p.excerpt,
  category: p.category, category_slug: p.category_slug, read_time: p.read_time,
  image_url: p.image_url, body_html: p.body_html,
  publish_date: p.publish_date, published_at: p.publish_date, status: 'published',
});
const newCampaign = (p) =>
  rest('marketing_campaigns', {
    method: 'POST',
    headers: { 'Content-Profile': 'company_os', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      brand_id: AIO_BRAND, name: p.title, starts_on: p.publish_date, ends_on: p.publish_date,
      status: 'done', created_by: BACKFILL_TAG,
    }),
  }).then((r) => r.json()).then((c) => (Array.isArray(c) ? c[0]?.id : c?.id));
const link = (contentId, campaignId) =>
  rest(`marketing_content?id=eq.${contentId}`, {
    method: 'PATCH',
    headers: { 'Content-Profile': 'company_os', 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign_id: campaignId }),
  });

console.log(`\nCOMMIT: ${nNew} inserts, ${nUpd} updates...\n`);
let ok = 0;
for (const p of posts) {
  const ex = findExisting(p);
  let contentId, needsCampaign;
  if (ex) {
    const r = await rest(`marketing_content?id=eq.${ex.id}`, {
      method: 'PATCH',
      headers: { 'Content-Profile': 'company_os', 'Content-Type': 'application/json' },
      body: JSON.stringify(contentFields(p)),
    });
    if (!r.ok) { console.error(`  UPDATE failed "${p.slug}"`, await r.text()); continue; }
    contentId = ex.id;
    needsCampaign = !ex.campaign_id;
  } else {
    const cRow = await rest('marketing_content', {
      method: 'POST',
      headers: { 'Content-Profile': 'company_os', 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ brand_id: AIO_BRAND, channel: 'blog', created_by: BACKFILL_TAG, ...contentFields(p) }),
    }).then((r) => r.json());
    contentId = Array.isArray(cRow) ? cRow[0]?.id : cRow?.id;
    if (!contentId) { console.error(`  INSERT failed "${p.slug}"`, cRow); continue; }
    needsCampaign = true;
  }
  if (needsCampaign) {
    const campaignId = await newCampaign(p);
    if (!campaignId) { console.error(`  campaign failed "${p.slug}"`); continue; }
    const l = await link(contentId, campaignId);
    if (!l.ok) { console.error(`  link failed "${p.slug}"`, await l.text()); continue; }
  }
  ok++;
  console.log(`  ${String(ok).padStart(2)}/${posts.length}  ${ex ? 'upd' : 'new'}  ${p.slug}`);
}
console.log(`\nDone. ${ok}/${posts.length}.`);
