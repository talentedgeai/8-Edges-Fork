import type { Metadata } from "next";
import "../../admin/admin.css";
import "@/app/styles/utilities.css";

// Bare, UN-gated auth shell so /team/login is reachable without a session. The
// (dashboard) group carries the requireTeamMember() gate.
export const metadata: Metadata = {
  title: "Sign in · 8 Edges Team",
  robots: { index: false, follow: false },
};

export default function TeamAuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
