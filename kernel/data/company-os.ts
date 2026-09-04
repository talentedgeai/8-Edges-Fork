import { companyOs } from "./supabase";

// Shared write helpers for the `company_os` schema. All site forms persist
// through these so the person-centric model (people → inquiries / applications
// / bookings / orders) stays consistent. Applications link straight to people;
// the candidates table is retired (kept read-only until the Phase 5 drop).

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

// Get-or-create a person by email (unique, citext). Uses ON CONFLICT DO NOTHING
// so we never clobber existing CRM data, then reads back the id. Race-safe.
// LinkedIn is a person attribute; it's filled in only where missing.
export async function getOrCreatePerson(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  source?: string | null;
}): Promise<Ok<{ id: string }> | Err> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "A valid email is required." };
  }

  const { error: upErr } = await companyOs.from("people").upsert(
    {
      email,
      full_name: input.name ?? null,
      phone: input.phone ?? null,
      linkedin_url: input.linkedin ?? null,
      source: input.source ?? null,
    },
    { onConflict: "email", ignoreDuplicates: true },
  );
  if (upErr) {
    console.error("[company-os] people upsert failed:", upErr.message);
    return { ok: false, error: "Could not save your details. Please try again." };
  }

  const { data, error } = await companyOs
    .from("people")
    .select("id, linkedin_url")
    .eq("email", email)
    .single();
  if (error || !data) {
    console.error("[company-os] people select failed:", error?.message);
    return { ok: false, error: "Could not save your details. Please try again." };
  }

  // Existing person without a LinkedIn: enrich, never overwrite.
  if (input.linkedin && !data.linkedin_url) {
    const { error: linkErr } = await companyOs
      .from("people")
      .update({ linkedin_url: input.linkedin })
      .eq("id", data.id);
    if (linkErr) console.error("[company-os] people linkedin enrich failed:", linkErr.message);
  }
  return { ok: true, id: data.id };
}

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

// Best-effort booking + order for the Saigon private retreat. Never throws —
// the lead (people + inquiries) is the authoritative record; this enriches it.
export async function recordPrivateSessionBooking(input: {
  personId: string;
  inquiryId: string | null;
  startDate: string;
  endDate: string;
  teamSize: number;
  amountCents: number;
  stripeSessionId: string | null;
  idea: string | null;
  days: number;
}): Promise<void> {
  try {
    let orderId: string | null = null;
    const { data: order, error: orderErr } = await companyOs
      .from("orders")
      .insert({
        person_id: input.personId,
        payment_method: "stripe",
        stripe_session_id: input.stripeSessionId,
        amount_cents: input.amountCents,
        currency: "usd",
        status: "pending",
        metadata: { event: "saigon-private", inquiry_id: input.inquiryId },
      })
      .select("id")
      .single();
    if (orderErr) console.error("[company-os] order insert failed:", orderErr.message);
    else orderId = order.id;

    const { error: bookErr } = await companyOs.from("bookings").insert({
      person_id: input.personId,
      order_id: orderId,
      kind: "private_session",
      start_date: input.startDate,
      end_date: input.endDate,
      party_size: input.teamSize,
      amount_cents: input.amountCents,
      currency: "usd",
      status: "pending",
      metadata: { idea: input.idea, inquiry_id: input.inquiryId, days: input.days },
    });
    if (bookErr) console.error("[company-os] booking insert failed:", bookErr.message);
  } catch (e) {
    console.error("[company-os] recordPrivateSessionBooking failed:", e);
  }
}
