import { companyOs } from "@/kernel/data/supabase";

// Application intake writes (company_os.applications and the resume document).
// Moved out of kernel/data/company-os.ts in ME-13: the hiring module owns the
// applications and documents tables, so the writes live behind its door.
// Applications link straight to people; the candidates table is retired.

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

// Get-or-create the application for (person, requisition). Sets the first
// pipeline stage if the requisition has one. Cover letter is pasted text;
// answers pair the requisition's questions with the applicant's responses,
// snapshotted at apply time. Source defaults to the careers site; recruiter
// intake passes its own.
export async function getOrCreateApplication(
  personId: string,
  jobRequisitionId: string,
  input: {
    coverLetter?: string | null;
    answers?: { q: string; a: string }[];
    meta?: Record<string, string>;
    source?: string;
    sourceDetail?: string;
  },
): Promise<Ok<{ id: string }> | Err> {
  const { data: stage } = await companyOs
    .from("application_stages")
    .select("id")
    .eq("job_requisition_id", jobRequisitionId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { error: upErr } = await companyOs.from("applications").upsert(
    {
      person_id: personId,
      job_requisition_id: jobRequisitionId,
      source: input.source ?? "career_site",
      source_detail: input.sourceDetail ?? "edge8.ai/careers",
      status: "active",
      current_stage_id: stage?.id ?? null,
      cover_letter: input.coverLetter?.trim() || null,
      answers: input.answers ?? [],
      metadata: input.meta ?? {},
    },
    { onConflict: "person_id,job_requisition_id", ignoreDuplicates: true },
  );
  if (upErr) {
    console.error("[company-os] application upsert failed:", upErr.message);
    return { ok: false, error: "Could not save the application." };
  }
  const { data, error } = await companyOs
    .from("applications")
    .select("id")
    .eq("person_id", personId)
    .eq("job_requisition_id", jobRequisitionId)
    .single();
  if (error || !data) {
    console.error("[company-os] application select failed:", error?.message);
    return { ok: false, error: "Could not save the application." };
  }
  return { ok: true, id: data.id };
}

// Insert a resume document (path in the `resumes` bucket) and link it to the
// application. Returns the document id.
export async function attachApplicationResume(
  applicationId: string,
  doc: { storagePath: string; mimeType: string | null; byteSize: number | null; personName: string },
): Promise<Ok<{ documentId: string }> | Err> {
  const { data, error } = await companyOs
    .from("documents")
    .insert({
      title: `Resume — ${doc.personName}`,
      storage_path: doc.storagePath,
      mime_type: doc.mimeType,
      byte_size: doc.byteSize,
      entity_type: "application",
      entity_id: applicationId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[company-os] document insert failed:", error?.message);
    return { ok: false, error: "Could not save the resume." };
  }
  const { error: linkErr } = await companyOs
    .from("applications")
    .update({ resume_document_id: data.id })
    .eq("id", applicationId);
  if (linkErr) console.error("[company-os] application resume link failed:", linkErr.message);
  return { ok: true, documentId: data.id };
}
