import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { hasAssignedStaff } from "@/entities/portal/lib/team";
import { hasInvoices } from "@/entities/portal/lib/invoices";
import { adminCompanyScope } from "@/entities/portal/lib/roles";
import { hasMeetings } from "@/entities/portal/lib/meetings";
import { hasBoard } from "@/entities/portal/lib/boards";
import { hasBacklog } from "@/entities/portal/lib/backlog";
import { PortalSidebar } from "@/entities/portal/ui/PortalSidebar";
import { AssumeBanner } from "@/entities/portal/ui/AssumeBanner";

export const metadata: Metadata = {
  title: { template: "%s · 8 Edges Client Portal", default: "8 Edges Client Portal" },
  description: "Your Edge8 client portal.",
  robots: { index: false, follow: false },
};

export default async function PortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requirePortalMember();
  // Temp-password holders pick their own password before seeing any data. The
  // target page lives in the (auth) group, outside this layout, so no loop.
  if (actor.mustChangePassword) redirect("/portal/change-password");
  const companyName =
    actor.memberships.length === 1
      ? actor.memberships[0].companyName
      : actor.memberships.map((m) => m.companyName).filter(Boolean).join(" · ") || null;
  // Time Off is visible iff Team is (same scope source: an active staff
  // assignment) — one lookup covers both, per the design doc's entitlement rules.
  const [hasStaff, hasInvoicesResult, hasMeetingsResult, hasBoardResult, hasBacklogResult] =
    await Promise.all([
      hasAssignedStaff(actor),
      hasInvoices(actor),
      hasMeetings(actor),
      hasBoard(actor),
      hasBacklog(actor),
    ]);
  const entitlements = {
    team: hasStaff,
    timeOff: hasStaff,
    invoices: hasInvoicesResult,
    users: adminCompanyScope(actor).length > 0,
    // Company Profile edits the shared company record, so it follows the same
    // admin-only rule as Users.
    companyProfile: adminCompanyScope(actor).length > 0,
    meetings: hasMeetingsResult,
    board: hasBoardResult,
    // Roadmap appears in the nav once the company actually has one.
    roadmap: hasBacklogResult,
    // Tokens is company-scoped (balances and delivery are per company), so it
    // needs a company in scope; being a member is otherwise the entitlement,
    // same rule as Requests.
    tokens: actor.companyScope.length > 0,
  };

  return (
    <div className="admin-fullheight">
      {actor.impersonation && (
        <AssumeBanner
          impersonation={actor.impersonation}
          viewingAsName={actor.displayName}
          companyName={companyName}
        />
      )}
      <div className="admin-shell u-grow u-minh-0">
        <PortalSidebar
          name={actor.displayName}
          companyName={companyName}
          entitlements={entitlements}
          impersonating={!!actor.impersonation}
        />
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
