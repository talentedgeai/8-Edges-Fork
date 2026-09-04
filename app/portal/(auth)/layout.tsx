import type { Metadata } from "next";
import "../../admin/admin.css";
import "@/app/styles/utilities.css";

// Bare, UN-gated auth shell so /portal/login is reachable without a session.
// The (dashboard) group carries the requirePortalMember() gate.
export const metadata: Metadata = {
  title: "Sign in · 8 Edges Client Portal",
  robots: { index: false, follow: false },
};

export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
