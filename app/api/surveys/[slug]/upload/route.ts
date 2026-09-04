import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { companyOs, supabase } from "@/lib/supabase";
import type { FieldConfig } from "@/lib/admin/surveys";

// Signed-URL issuer for survey `file` fields. The runner used to POST the file
// itself through this route, but Vercel rejects request bodies over ~4.5 MB
// with a 413 before the function runs, so phone photos of ID cards failed even
// though the form promises 10 MB. Now the runner sends only the file's
// metadata; we validate it against the survey field's config and return a
// one-time signed upload URL, and the browser PUTs the file straight to
// Supabase Storage. The buckets themselves enforce the same 10 MB / mime
// limits, so bytes that bypass this route are still constrained. Public by
// design (surveys are unauthenticated) but tightly scoped: we only sign an
// upload for a real, published survey's real `file` field, into that field's
// private bucket (e.g. `id-documents`); the path is never public.

export const runtime = "nodejs";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const body = (await req.json().catch(() => null)) as {
      field_id?: string;
      file_type?: string;
      file_size?: number;
    } | null;
    const fieldId = String(body?.field_id ?? "");
    const fileType = String(body?.file_type ?? "");
    const fileSize = Number(body?.file_size ?? 0);

    if (!fieldId) return NextResponse.json({ error: "Missing field." }, { status: 400 });
    if (!fileType || !Number.isFinite(fileSize) || fileSize <= 0)
      return NextResponse.json({ error: "No file." }, { status: 400 });

    // The survey must exist, be published, and own a `file` field with this id.
    const { data: survey } = await companyOs
      .from("surveys")
      .select("id, status, archived_at")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!survey || survey.archived_at || survey.status !== "published")
      return NextResponse.json({ error: "Survey not accepting responses." }, { status: 410 });

    const { data: field } = await companyOs
      .from("survey_fields")
      .select("id, type, config")
      .eq("id", fieldId)
      .eq("survey_id", survey.id)
      .maybeSingle();
    if (!field || field.type !== "file")
      return NextResponse.json({ error: "Not a file question." }, { status: 400 });

    const config = (field.config ?? {}) as FieldConfig;
    const bucket = config.bucket || "survey-uploads";
    const accept = config.accept && config.accept.length > 0 ? config.accept : DEFAULT_ACCEPT;
    const maxBytes = config.max_bytes ?? DEFAULT_MAX_BYTES;

    if (!accept.includes(fileType))
      return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
    if (fileSize > maxBytes)
      return NextResponse.json(
        { error: `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).` },
        { status: 400 },
      );

    const ext = EXT[fileType] ?? "bin";
    const path = `${params.slug}/${fieldId}/${randomUUID()}.${ext}`;
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);
    if (signErr || !signed?.signedUrl) {
      console.error("[survey upload] sign failed:", signErr?.message);
      return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path, url: signed.signedUrl });
  } catch (err) {
    console.error("[survey upload] error:", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
