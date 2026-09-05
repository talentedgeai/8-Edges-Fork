import Link from "next/link";
import type { Metadata } from "next";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { listBroadcasts, type BroadcastStatus } from "@/entities/company-os/modules/campaigns/broadcasts";
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

export default async function BroadcastsPage() {
  await requireAdmin();
  const { rows, error } = await listBroadcasts();

  return (
    <div>
      <PageHead
        eyebrow={<>Revenue · <Link href="/admin/revenue/marketing">Marketing</Link></>}
        title="Broadcasts"
        sub={`${rows.length} broadcast${rows.length === 1 ? "" : "s"}. Nothing sends without an explicit approval.`}
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
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="admin-cell-strong">
                      <Link href={`/admin/revenue/marketing/broadcasts/${row.id}`}>{row.name}</Link>
                    </td>
                    <td className="admin-cell-muted">{row.brandName ?? "—"}</td>
                    <td className="admin-cell-muted">{row.subject}</td>
                    <td>
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="admin-cell-mono">{formatDate(row.createdAt)}</td>
                    <td className="admin-cell-mono">{formatDate(row.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
