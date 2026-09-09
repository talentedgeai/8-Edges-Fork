import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { listBroadcasts, getBroadcastStats, type BroadcastRow, type BroadcastStatus } from "@/entities/company-os/modules/campaigns/broadcasts";
import { getBroadcastUnsubscribes } from "@/entities/company-os/modules/campaigns/broadcast-report";
import { NewBroadcastButton } from "./NewBroadcastButton";
import { formatDate } from "@/kernel/ui/format";

export const metadata: Metadata = {
  title: "Broadcasts",
  description: "Newsletter and marketing email broadcasts.",
};

const STATUS_TONE: Record<BroadcastStatus, "ok" | "warn" | "err" | "info"> = {
  draft: "info",
  approved: "warn",
  sending: "warn",
  sent: "ok",
  cancelled: "err",
};

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
};

type BroadcastMetrics = { sent: number; opened: number; clicked: number; unsubscribed: number };

// Metrics only exist once a broadcast has gone out, so drafts and approved-but-
// unsent broadcasts are left out and render as a dash. Each sent broadcast is
// costed the same way the detail page costs it, run in parallel across the list.
async function metricsFor(rows: BroadcastRow[]): Promise<Map<string, BroadcastMetrics>> {
  const sent = rows.filter((r) => r.status === "sending" || r.status === "sent");
  const entries = await Promise.all(
    sent.map(async (row): Promise<[string, BroadcastMetrics]> => {
      const [stats, unsubscribed] = await Promise.all([
        getBroadcastStats(row.id),
        getBroadcastUnsubscribes(row.id, row.approvedAt),
      ]);
      return [row.id, { sent: stats.sent, opened: stats.opened, clicked: stats.clicked, unsubscribed }];
    }),
  );
  return new Map(entries);
}

export default async function BroadcastsPage() {
  await requireAdmin();
  const { rows, error } = await listBroadcasts();
  const metrics = await metricsFor(rows);

  return (
    <div>
      <PageHead
        eyebrow={<>Revenue · <Link href="/admin/revenue/marketing">Marketing</Link></>}
        title="Broadcasts"
        sub={
          <>
            {rows.length} broadcast{rows.length === 1 ? "" : "s"}. Nothing sends without an explicit approval.{" "}
            <Link href="/admin/revenue/marketing/recaps">Content recommendations</Link>.
          </>
        }
        action={<NewBroadcastButton />}
      />

      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      <div className="admin-table-wrap">
        {rows.length === 0 ? (
          <div className="admin-empty">No broadcasts yet.</div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th className="u-right">Sent</th>
                  <th className="u-right">Open</th>
                  <th className="u-right">Click</th>
                  <th className="u-right">Unsub</th>
                  <th>Created</th>
                  <th>Sent at</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const m = metrics.get(row.id);
                  return (
                  <tr key={row.id}>
                    <td className="admin-cell-strong">
                      <Link href={`/admin/revenue/marketing/broadcasts/${row.id}`}>{row.name}</Link>
                    </td>
                    <td className="admin-cell-muted">{row.brandName ?? "—"}</td>
                    <td>
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="admin-cell-mono u-right">{m ? m.sent.toLocaleString() : "—"}</td>
                    <td className="admin-cell-mono u-right">{m ? m.opened.toLocaleString() : "—"}</td>
                    <td className="admin-cell-mono u-right">{m ? m.clicked.toLocaleString() : "—"}</td>
                    <td className="admin-cell-mono u-right">{m ? m.unsubscribed.toLocaleString() : "—"}</td>
                    <td className="admin-cell-mono">{formatDate(row.createdAt)}</td>
                    <td className="admin-cell-mono">{formatDate(row.sentAt)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
