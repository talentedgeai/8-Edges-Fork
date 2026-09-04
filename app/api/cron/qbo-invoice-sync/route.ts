import { NextResponse } from "next/server";
import { syncQboInvoices } from "@/lib/admin/qbo-invoice-sync";
import type { QboEntity } from "@/lib/qbo";
import { notifyOps } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITIES: QboEntity[] = ["edge8", "aio"];

// Vercel cron (see vercel.json): weekly QuickBooks invoice mirror for every
// connected company. Read-from-QBO, upsert-into-Supabase; never deletes. Runs
// after the token keepalive so tokens are fresh. Lark-warns on hard failures;
// unmapped customers are reported but are not failures (expected for AIO until
// its customers are mapped).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = [];
  for (const entity of ENTITIES) results.push(await syncQboInvoices(entity));

  // A disconnected company degrades quietly (normal until connected); only a
  // real API/DB error alarms.
  const failed = results.filter((r) => !r.ok && r.error && !/not connected/i.test(r.error));
  for (const r of failed) {
    await notifyOps(
      `⚠️ QuickBooks (${r.entity}) invoice sync failed: ${r.error}. Ledger may be stale: https://www.edge8.ai/admin/revenue/invoices`,
    );
  }

  return NextResponse.json({ results }, { status: failed.length ? 500 : 200 });
}
