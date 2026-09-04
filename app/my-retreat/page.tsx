import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MY_RETREAT_COOKIE, verifyAccessGrant } from "@/lib/my-retreat/access";
import { MyRetreatGate } from "./MyRetreatGate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Retreat", robots: { index: false, follow: false } };

// The soft gate. If a valid grant cookie is already present, skip straight to
// that retreat's hub; otherwise show the access-code / email entry.
export default async function MyRetreatGatePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const token = cookies().get(MY_RETREAT_COOKIE)?.value;
  const grant = await verifyAccessGrant(token);
  if (grant?.eventSlug) redirect(`/my-retreat/${grant.eventSlug}`);

  // /api/my-retreat/verify sends every rejected link here with ?error=expired.
  const initialError =
    searchParams?.error === "expired"
      ? "That link has expired or is no longer valid. Enter your access code to get a new one."
      : null;

  return (
    <main className="site-retreat-hero">
      <MyRetreatGate initialError={initialError} />
    </main>
  );
}
