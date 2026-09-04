import { NextResponse } from "next/server";
import { requireAdmin, canViewSensitive } from "@/lib/admin-auth";
import { companyOs } from "@/lib/supabase";
import { signedIdUrl, type IdSide } from "@/lib/id-documents";

// Serves a team member's ID-card scan (front/back) to a cleared admin by
// redirecting to a short-lived signed URL. Gated: requireAdmin() first, THEN
// canViewSensitive() — ID scans are PII, restricted to Dave and Mai (a plain
// admin is not enough). The person is resolved from the team_directory id in
// the path (never a client-supplied person id). The scans live in the PRIVATE
// id-documents bucket, so they are never a public URL — only this authenticated
// redirect. The selfie is not served here: it lives in the public avatars
// bucket as the profile photo. `force-dynamic` so the signed URL is minted per
// request, never cached.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; side: string }> },
) {
  const admin = await requireAdmin();
  if (!(await canViewSensitive(admin.email))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { id, side } = await params;
  if (side !== "front" && side !== "back") {
    return new NextResponse("Not found", { status: 404 });
  }
  const { data } = await companyOs
    .from("team_directory")
    .select("person_id")
    .eq("id", id)
    .maybeSingle();
  const personId = (data as { person_id: string | null } | null)?.person_id ?? null;
  if (!personId) return new NextResponse("Not found", { status: 404 });

  const url = await signedIdUrl(personId, side as IdSide);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
