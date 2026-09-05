import { NextResponse } from "next/server";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";

// Mint a short-lived signed URL for a resume document and redirect to it.
// Gated by requireAdmin (middleware also gates /admin/*). The `resumes` bucket
// is private; site forms upload there via the service-role client.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();

  const { data: doc, error } = await companyOs
    .from("documents")
    .select("storage_path")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !doc?.storage_path) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from("resumes")
    .createSignedUrl(doc.storage_path, 300);
  if (sErr || !signed?.signedUrl) {
    return new NextResponse("Could not generate a resume link", { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
