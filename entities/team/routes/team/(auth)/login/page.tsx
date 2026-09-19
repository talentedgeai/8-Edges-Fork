import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function TeamLoginPage() {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          8 Edges Team
        </div>
        <p className="admin-auth-sub">Sign in to your team workspace.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
