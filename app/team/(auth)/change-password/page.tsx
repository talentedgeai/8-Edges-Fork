import { requireTeamMember } from "@/lib/team-auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

// Lives in the un-gated (auth) group so nothing loops back here; the page still
// gates itself, a session is required before a password can be set. Reached from
// the /team/verify recovery redirect (Forgot password on /team/login).
export default async function TeamChangePasswordPage() {
  await requireTeamMember();
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          8 Edges Team
        </div>
        <p className="admin-auth-sub">
          Choose a password for your account. You can always sign in with a link instead.
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
