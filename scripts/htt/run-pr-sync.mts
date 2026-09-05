// Run the nightly PR sync handler locally, outside Vercel. Needs GH_PAT (a gh
// auth token is fine) and CRON_SECRET in the environment, plus .env.local
// loaded. Used by nightly-local-sync.sh until the hosted cron has its secrets.
import { GET } from "@/app/api/cron/htt-sync-prs/route";
const res = await GET(new Request("http://local/api/cron/htt-sync-prs", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
const body = await res.json();
console.log(JSON.stringify({ reposSynced: body.reposSynced, prsUpserted: body.prsUpserted, unattributed: body.unattributed, errors: (body.errors ?? []).length }));
