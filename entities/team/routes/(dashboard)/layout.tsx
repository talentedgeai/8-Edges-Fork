import type { Metadata } from "next";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { isCoach } from "@/entities/team/modules/coaching";
import { hasClientAssignments } from "@/entities/team/modules/hub/clients";
import { isHiringManager } from "@/entities/team/lib/hiring";
import { TeamSidebar } from "@/entities/team/ui/TeamSidebar";
import { TeamChatWidget } from "@/entities/team/ui/TeamChatWidget";

export const metadata: Metadata = {
  title: { template: "%s · 8 Edges Team", default: "8 Edges Team" },
  description: "Your Edge8 team workspace.",
  robots: { index: false, follow: false },
};

export default async function TeamDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireTeamMember();
  const [coaches, hasClients, hiringManager] = await Promise.all([
    isCoach(actor),
    hasClientAssignments(actor),
    isHiringManager(actor),
  ]);

  return (
    <div className="admin-shell">
      <TeamSidebar
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
