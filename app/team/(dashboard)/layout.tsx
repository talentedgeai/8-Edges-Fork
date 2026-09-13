// The team hub's composition root. Like the Admin layout this is not a mount:
// the navigation is generated from this deployment's entity list (ADR 0002), so
// app/ is the only place it can be named. It guards the surface, resolves the
// three capabilities the nav is filtered on, and renders the shell.
import type { Metadata } from "next";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { isCoach } from "@/entities/coaching";
import { hasClientAssignments, isHiringManager, TeamSidebar, TeamChatWidget } from "@/entities/team";
import { TEAM_NAV } from "@/app/nav";
import "@/app/admin/admin.css";
import "@/app/styles/utilities.css";

export const metadata: Metadata = {
  title: { template: "%s · 8 Edges Team", default: "8 Edges Team" },
  description: "Your Edge8 team workspace.",
  robots: { index: false, follow: false },
};

export default async function TeamDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTeamMember();
  const [coaches, hasClients, hiringManager] = await Promise.all([
    isCoach(actor),
    hasClientAssignments(actor),
    isHiringManager(actor),
  ]);

  return (
    <div className="admin-shell">
      <TeamSidebar
        sections={TEAM_NAV}
        name={actor.displayName}
        avatarUrl={actor.avatarUrl}
        role={actor.role}
        isAdmin={actor.isAdmin}
        isCoach={coaches}
        hasClients={hasClients}
        isHiringManager={hiringManager}
      />
      <main className="admin-main">{children}</main>
      <TeamChatWidget />
    </div>
  );
}
