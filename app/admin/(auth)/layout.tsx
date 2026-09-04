import type { Metadata } from "next";
import "../admin.css";
import "@/app/styles/utilities.css";

// Bare auth shell — deliberately NOT gated (so the login page is reachable
// without a session). The (dashboard) group carries the requireAdmin() gate.
export const metadata: Metadata = {
  title: "Sign in · 8 Edges",
  robots: { index: false, follow: false },
};

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
