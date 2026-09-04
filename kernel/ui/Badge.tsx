import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "err" | "info" | "pink" | "neutral";

export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  const cls = [
    "admin-badge",
    tone !== "neutral" ? `admin-badge--${tone}` : "",
    dot ? "admin-badge--dot" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{children}</span>;
}

// Map common company_os status/stage strings to a badge tone.
export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "won":
    case "paid":
    case "confirmed":
    case "active":
    case "hired":
      return "ok";
    case "lost":
    case "rejected":
    case "refunded":
    case "cancelled":
    case "do_not_pursue":
    case "terminated":
    case "overdue":
      return "err";
    case "pending":
    case "on_hold":
    case "discovery":
    case "proposal":
    case "passive":
    case "future_consideration":
      return "warn";
    case "new_lead":
    case "contacted":
    case "open":
    case "filled":
    case "placed":
      return "info";
    default:
      return "neutral";
  }
}
