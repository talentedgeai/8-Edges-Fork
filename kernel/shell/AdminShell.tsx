// The Admin surface's shell: the frame every admin page renders inside (ADR
// 0002). It owns the layout and the sidebar chrome and names no entity — the
// navigation, the sign-out action and the assistant widget are handed to it by
// the composition root, which is the only place that knows which entities this
// deployment installs.
import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import type { NavSection } from "./nav";

export function AdminShell({
  sections,
  signOut,
  user,
  avatarUrl,
  canSwitchToTeam,
  isSuperAdmin,
  assistant,
  children,
}: {
  sections: NavSection[];
  signOut: () => void | Promise<void>;
  user: { email: string };
  avatarUrl: string | null;
  canSwitchToTeam: boolean;
  isSuperAdmin: boolean;
  /** The chat widget, rendered by whichever entity owns the assistant. */
  assistant: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <AdminSidebar
        sections={sections}
        signOut={signOut}
        user={user}
        avatarUrl={avatarUrl}
        canSwitchToTeam={canSwitchToTeam}
        isSuperAdmin={isSuperAdmin}
      />
      <main className="admin-main">{children}</main>
      {assistant}
    </div>
  );
}
