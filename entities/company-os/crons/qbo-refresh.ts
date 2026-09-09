import { NextResponse } from "next/server";
import { withRoutineRun } from "@/kernel/audit/routine-runs";
import { getQboConnectionStatus, refreshQboTokens, type QboEntity } from "@/entities/company-os/lib/qbo";
import { notifyOps } from "@/kernel/messaging/lark";

const ENTITIES: QboEntity[] = ["edge8", "aio"];

// Vercel cron (see vercel.json): weekly QuickBooks token keepalive, run for
// every connected company. Intuit refresh tokens die ~100 days after issue;
// refreshing weekly means a connection never idles out between invoices.
// Lark-warns per company when a refresh fails or the expiry is inside 14 days.
async function keepalive(entity: QboEntity) {
  const status = await getQboConnectionStatus(entity);
  if (!status.connected) {
    // Not connected is a normal state until the connect flow is run once for
    // this company — no alarm, just report.
    return { entity, connected: false as const };
  }

  const result = await refreshQboTokens(entity);
  if (!result.ok) {
    await notifyOps(
      `⚠️ QuickBooks (${entity}) token refresh failed (${result.error}). Invoicing degrades to manual until reconnected: https://www.edge8.ai/admin/settings/quickbooks`,
    );
    return { entity, connected: true as const, refreshed: false as const, error: result.error };
  }

  const after = await getQboConnectionStatus(entity);
  if (after.connected) {
    const daysLeft = (new Date(after.refreshTokenExpiresAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 14) {
      await notifyOps(
        `⚠️ QuickBooks (${entity}) refresh token expires in ${Math.floor(daysLeft)} days — reconnect at https://www.edge8.ai/admin/settings/quickbooks`,
      );
    }
  }
  return { entity, connected: true as const, refreshed: true as const };
}

async function handler(req: Request) {
  const results = [];
  for (const entity of ENTITIES) results.push(await keepalive(entity));
  const failed = results.some((r) => r.connected && r.refreshed === false);
  return NextResponse.json({ results }, { status: failed ? 500 : 200 });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/qbo-refresh/", req, handler);
