import type { Metadata } from "next";
import { requireAdmin, isSuperAdmin } from "@/kernel/identity/admin-auth";
import { hasTeamAccess } from "@/kernel/identity/team-auth";
import { avatarUrlForAuthUser } from "@/entities/retreats";
import { AdminSidebar } from "@/entities/company-os/ui/AdminSidebar";
import { AdminChatWidget } from "@/entities/company-os/ui/AdminChatWidget";
import { isPrivilegedChatUser } from "@/entities/assistant";
export const metadata: Metadata = {
  title: { template: "%s · 8 Edges", default: "8 Edges" },
  description: "Edge8 Company OS — the internal admin for contacts, revenue, talent, and operations.",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const [canSwitchToTeam, avatarUrl, superAdmin] = await Promise.all([
    hasTeamAccess(user.id),
    avatarUrlForAuthUser(user.id),
    isSuperAdmin(user.email),
  ]);

  return (
    <div className="admin-shell">
      <AdminSidebar
        user={user}
        avatarUrl={avatarUrl}
        canSwitchToTeam={canSwitchToTeam}
        isSuperAdmin={superAdmin}
      />
      <main className="admin-main">{children}</main>
      <AdminChatWidget canWrite={isPrivilegedChatUser(user.email)} />
    </div>
  );
}
