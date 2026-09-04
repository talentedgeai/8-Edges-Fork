// Core values: the six Edge8 values, company-visible on /team/values and
// editable in the DB like the rest of the strategy layer.
// Run from the repo root: node scripts/edges/migrate-core-values.mjs
// Idempotent: create if missing, then upsert the canonical six by sort_order.
import { sql } from '../crm/db.mjs';

await sql.unsafe(`
  create table if not exists company_os.core_values (
    id uuid primary key default gen_random_uuid(),
    sort_order int not null unique,
    title text not null,
    description text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`);

// Same grant set as the other company_os goal tables (see migrate.mjs).
for (const stmt of [
  `grant select, insert, update, delete on company_os.core_values to service_role`,
  `grant select on company_os.core_values to team_chatbot_reader`,
  `grant select on company_os.core_values to chatbot_reader`,
]) {
  await sql.unsafe(stmt);
}

const VALUES = [
  ['Leverage Intelligence', 'Use AI to think smarter, work faster, and raise the quality of everything you do.'],
  ['Deliver Impact', 'Ship meaningful progress weekly that moves clients, products, and the business forward.'],
  ['Communicate Transparently', 'Work in the open. Share progress, questions, decisions, and blockers so teams move faster together.'],
  ['Act With Ownership', 'Take responsibility, proactively solve problems, and follow through until the result is achieved.'],
  ['Learn and Share', 'Grow every week and make your learning visible to strengthen the team and the AIO community.'],
  ['Have Fun Building', 'Bring energy, curiosity, and play into the work. Enjoy experimenting, collaborating, and creating.'],
];

for (const [i, [title, description]] of VALUES.entries()) {
  await sql`
    insert into company_os.core_values (sort_order, title, description)
    values (${i + 1}, ${title}, ${description})
    on conflict (sort_order) do update
      set title = excluded.title, description = excluded.description, updated_at = now()
  `;
}

const rows = await sql`select sort_order, title from company_os.core_values order by sort_order`;
console.log(rows.map((r) => `${r.sort_order}. ${r.title}`).join('\n'));
await sql.end();
