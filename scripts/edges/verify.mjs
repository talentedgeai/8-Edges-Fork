// Eight Edges: PR 1 exit test. Walks the cascade from an executor key result
// up to its company objective and prints the chain.
// Run from the repo root: node scripts/edges/verify.mjs
import { sql } from '../crm/db.mjs';

const chains = await sql`
  with recursive chain as (
    select o.id, o.level, o.title, o.parent_kr_id, 0 as depth
    from company_os.objectives o where o.level = 'executor'
    union all
    select po.id, po.level, po.title, po.parent_kr_id, chain.depth + 1
    from chain
    join company_os.key_results pk on pk.id = chain.parent_kr_id
    join company_os.objectives po on po.id = pk.objective_id
  )
  select * from chain order by depth`;

if (!chains.length) { console.error('FAIL: no executor objectives found'); process.exit(1); }
const top = chains.filter((c) => c.depth === Math.max(...chains.map((x) => x.depth)));
if (!top.every((c) => c.level === 'company')) { console.error('FAIL: chain does not end at company level'); process.exit(1); }

for (const c of chains) console.log(`${'  '.repeat(c.depth)}${c.level.toUpperCase()}: ${c.title}`);
console.log('\nPASS: executor goals trace to company goals.');
await sql.end();
