// Phase 1 backfill: give every orphaned Edge8 blog asset its own campaign.
// Dry-run by default (prints the plan). Pass --commit to write.
// Reversible: created campaigns carry created_by = BACKFILL_TAG, so the whole
// set can be found and unlinked/deleted later.
//
//   node scripts/backfill-edge8-campaigns.mjs            # dry run
//   node scripts/backfill-edge8-campaigns.mjs --commit   # write

import fs from 'node:fs';

const ENV_PATH = '/Users/davepro/code-projects/edge8-web/.env.local';
const BACKFILL_TAG = 'backfill-2026-08-30';
const EDGE8_BRAND = '02f31cd4-b402-4db7-9988-c331f7d47785';
const COMMIT = process.argv.includes('--commit');

const env = fs.readFileSync(ENV_PATH, 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
const URL = pick('SUPABASE_URL');
const KEY = pick('SUPABASE_SECRET_KEY');

const base = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rest = (path, init = {}) =>
  fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...base, ...(init.headers || {}) } });

// Orphaned Edge8 blogs: channel=blog, brand=edge8, no campaign yet.
const orphans = await rest(
  `marketing_content?select=id,title,publish_date,pillar_id,status` +
    `&channel=eq.blog&brand_id=eq.${EDGE8_BRAND}&campaign_id=is.null&order=publish_date.asc`,
  { headers: { 'Accept-Profile': 'company_os' } },
).then((r) => r.json());

if (!Array.isArray(orphans)) {
  console.error('Query failed:', orphans);
  process.exit(1);
}

console.log(`Orphaned Edge8 blog assets (channel=blog, campaign_id null): ${orphans.length}\n`);
orphans.forEach((o, i) =>
  console.log(
    `${String(i + 1).padStart(2)}. [${o.publish_date ?? '    no date '}] ${o.status.padEnd(9)} ${o.title}`,
  ),
);

if (!COMMIT) {
  console.log(`\nDRY RUN. Would create ${orphans.length} campaigns (one per blog) and link each.`);
  console.log('Re-run with --commit to write.');
  process.exit(0);
}

console.log(`\nCOMMIT: creating ${orphans.length} campaigns...\n`);
let ok = 0;
for (const o of orphans) {
  const campaign = {
    brand_id: EDGE8_BRAND,
    name: o.title,
    pillar_id: o.pillar_id,
    starts_on: o.publish_date,
    ends_on: o.publish_date,
    status: 'done',
    created_by: BACKFILL_TAG,
  };
  const created = await rest('marketing_campaigns', {
    method: 'POST',
    headers: {
      'Content-Profile': 'company_os',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(campaign),
  }).then((r) => r.json());

  const campaignId = Array.isArray(created) ? created[0]?.id : created?.id;
  if (!campaignId) {
    console.error(`  FAILED to create campaign for "${o.title}":`, created);
    continue;
  }
  const link = await rest(`marketing_content?id=eq.${o.id}`, {
    method: 'PATCH',
    headers: { 'Content-Profile': 'company_os', 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign_id: campaignId }),
  });
  if (!link.ok) {
    console.error(`  Created campaign ${campaignId} but link FAILED for "${o.title}"`, await link.text());
    continue;
  }
  ok++;
  console.log(`  ${String(ok).padStart(2)}/${orphans.length}  ${campaignId}  ←  ${o.title}`);
}
console.log(`\nDone. Linked ${ok}/${orphans.length}.`);
