import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { Badge, statusTone } from "@/components/admin/Badge";
import { formatCents, formatDate, humanize } from "@/lib/admin/format";
import { one } from "@/lib/embedded";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Retreats",
  description: "Per-retreat P&L across every Infinite Leverage retreat.",
};

// Registration statuses that count as a real (paid) seat — mirrors the event
// detail page so the auto Stripe revenue matches the P&L tab.
const COUNTED_STATUSES = new Set(["registered", "attended", "confirmed"]);

type EventRow = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  starts_at: string | null;
  ends_at: string | null;
};
type PnlRow = { event_id: string; side: string; actual_usd_cents: number | string | null };
type OrderEmbed = { amount_usd_cents: number | string | null };
type RegRow = { event_id: string; status: string; orders: OrderEmbed | OrderEmbed[] | null };

const n = (v: number | string | null | undefined): number =>
  v === null || v === undefined || v === "" ? 0 : Number(v) || 0;

export default async function RetreatsPage() {
  const { data: eventsData } = await companyOs
    .from("events")
    .select("id, title, status, visibility, starts_at, ends_at")
    .eq("type", "retreat")
    .is("archived_at", null)
    .order("starts_at", { ascending: false });
  const events = (eventsData ?? []) as EventRow[];
  const ids = events.map((e) => e.id);

  const [pnlRes, regRes] = await Promise.all([
    ids.length
      ? companyOs.from("event_pnl_lines").select("event_id, side, actual_usd_cents").in("event_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? companyOs
          .from("event_registrations")
          .select("event_id, status, orders(amount_usd_cents)")
          .in("event_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const pnl = (pnlRes.data ?? []) as PnlRow[];
  const regs = (regRes.data ?? []) as RegRow[];

  const rows = events.map((e) => {
    const lines = pnl.filter((l) => l.event_id === e.id);
    const manualRevenue = lines.filter((l) => l.side === "revenue").reduce((s, l) => s + n(l.actual_usd_cents), 0);
    const expense = lines.filter((l) => l.side === "expense").reduce((s, l) => s + n(l.actual_usd_cents), 0);
    const autoRevenue = regs
      .filter((r) => r.event_id === e.id && COUNTED_STATUSES.has(r.status))
      .reduce((s, r) => s + n(one(r.orders)?.amount_usd_cents), 0);
    const revenue = manualRevenue + autoRevenue;
    return { ev: e, revenue, expense, profit: revenue - expense, lineCount: lines.length };
  });

  const totals = rows.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, expense: a.expense + r.expense, profit: a.profit + r.profit }),
    { revenue: 0, expense: 0, profit: 0 },
  );

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Retreats"
        sub={`${events.length} ${events.length === 1 ? "retreat" : "retreats"} · profit ${formatCents(totals.profit, "usd")} · open a retreat to edit its P&L`}
      />

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Retreat</th>
              <th>Dates</th>
              <th>Status</th>
              <th className="u-right">Revenue</th>
              <th className="u-right">Expenses</th>
              <th className="u-right">Profit</th>
              <th className="u-right">Lines</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="admin-empty">No retreats yet.</div>
                </td>
              </tr>
            ) : (
              rows.map(({ ev, revenue, expense, profit, lineCount }) => (
                <tr key={ev.id}>
                  <td>
                    <Link
                      href={`/admin/revenue/events/${ev.id}`}
                      className="u-strong u-link-plain"
                    >
                      {ev.title}
                    </Link>
                    {ev.visibility === "private" && (
                      <span className="admin-cell-muted u-sm">
                        {" "}
                        · private
                      </span>
                    )}
                  </td>
                  <td className="admin-cell-muted">
                    {ev.starts_at ? formatDate(ev.starts_at) : "—"}
                    {ev.ends_at ? ` → ${formatDate(ev.ends_at)}` : ""}
                  </td>
                  <td>
                    <Badge tone={statusTone(ev.status)}>{humanize(ev.status)}</Badge>
                  </td>
                  <td className="admin-cell-mono u-right">
                    {formatCents(revenue, "usd")}
                  </td>
                  <td className="admin-cell-mono u-right">
                    {formatCents(expense, "usd")}
                  </td>
                  <td className="admin-cell-mono u-right">
                    {formatCents(profit, "usd")}
                  </td>
                  <td className="admin-cell-mono u-right">
                    {lineCount || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3}>
                  <strong>Total</strong>
                </td>
                <td className="admin-cell-mono u-right">
                  <strong>{formatCents(totals.revenue, "usd")}</strong>
                </td>
                <td className="admin-cell-mono u-right">
                  <strong>{formatCents(totals.expense, "usd")}</strong>
                </td>
                <td className="admin-cell-mono u-right">
                  <strong>{formatCents(totals.profit, "usd")}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
