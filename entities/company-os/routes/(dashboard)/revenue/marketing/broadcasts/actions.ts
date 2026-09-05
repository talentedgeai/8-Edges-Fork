"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { sendMarketingEmail } from "@/entities/site";
import { getBroadcast, resolveAudience, type BroadcastSegment } from "@/entities/company-os/modules/campaigns/broadcasts";

type ActionResult = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

function refresh(id?: string) {
  revalidatePath("/admin/revenue/marketing");
  revalidatePath("/admin/revenue/marketing/broadcasts");
  if (id) revalidatePath(`/admin/revenue/marketing/broadcasts/${id}`);
}

export async function createBroadcast(input: { name: string; subject: string }): Promise<CreateResult> {
  const admin = await requireAdmin();
  const name = input.name.trim();
  const subject = input.subject.trim();
  if (!name) return { ok: false, error: "Give the broadcast a name." };
  if (!subject) return { ok: false, error: "Give the broadcast a subject line." };

  const { data, error } = await companyOs
    .from("email_campaigns")
    .insert({ name, subject, created_by: admin.email })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Broadcast was not created." };

  const id = (data as { id: string }).id;
  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "insert",
    actor: admin.email,
    context: { name },
  });
  refresh(id);
  return { ok: true, id };
}

export async function updateBroadcast(
  id: string,
  patch: {
    name?: string;
    subject?: string;
    preheader?: string;
    bodyMd?: string;
    segment?: BroadcastSegment;
    replyTo?: string;
    batchSize?: number;
    brandId?: string | null;
    scheduledAt?: string | null;
  },
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };

  // Editing an approved or sent campaign would change what recipients receive
  // partway through a send, so the body is frozen once it leaves draft.
  if (campaign.status !== "draft") {
    return { ok: false, error: `A ${campaign.status} broadcast cannot be edited. Cancel it first.` };
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.subject !== undefined) update.subject = patch.subject.trim();
  if (patch.preheader !== undefined) update.preheader = patch.preheader.trim() || null;
  if (patch.bodyMd !== undefined) update.body_md = patch.bodyMd;
  if (patch.segment !== undefined) update.segment = patch.segment;
  if (patch.replyTo !== undefined) update.reply_to = patch.replyTo.trim() || null;
  if (patch.batchSize !== undefined) {
    if (!Number.isFinite(patch.batchSize) || patch.batchSize < 1 || patch.batchSize > 1000) {
      return { ok: false, error: "Batch size must be between 1 and 1000." };
    }
    update.batch_size = Math.floor(patch.batchSize);
  }
  if (patch.brandId !== undefined) update.brand_id = patch.brandId || null;
  if (patch.scheduledAt !== undefined) {
    // datetime-local sends a wall-clock string with no zone; normalise to ISO.
    update.scheduled_at = patch.scheduledAt ? new Date(patch.scheduledAt).toISOString() : null;
  }
  if (update.name === "") return { ok: false, error: "Name cannot be empty." };
  if (update.subject === "") return { ok: false, error: "Subject cannot be empty." };

  const { error } = await companyOs.from("email_campaigns").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { fields: Object.keys(update) },
  });
  refresh(id);
  return { ok: true };
}

// Materialises the audience into email_campaign_recipients. Re-runnable while
// the campaign is a draft: the unique (campaign_id, person_id) constraint means
// re-building after editing the segment adds newcomers without duplicating anyone.
export async function buildRecipients(id: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  if (campaign.status !== "draft") {
    return { ok: false, error: "Recipients can only be built while the broadcast is a draft." };
  }

  const { members, error } = await resolveAudience(campaign.segment, campaign.brandId);
  if (error) return { ok: false, error };
  if (members.length === 0) {
    return {
      ok: false,
      error: campaign.brandId
        ? "That segment matches nobody. A branded broadcast only reaches that brand's audience — add contacts to the brand first."
        : "That segment matches nobody.",
    };
  }

  // Paged: an unbounded select is capped by PostgREST and truncates silently.
  // A partial "already" set would let an existing person through, and Postgres
  // rejects the whole insert on the unique constraint, so buildRecipients would
  // fail with a duplicate-key error and could never be re-run on that campaign.
  const PAGE = 500;
  const already = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data: existing, error: existingError } = await companyOs
      .from("email_campaign_recipients")
      .select("person_id")
      .eq("campaign_id", id)
      .order("person_id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (existingError) return { ok: false, error: existingError.message };
    const page = (existing ?? []) as { person_id: string }[];
    for (const row of page) already.add(row.person_id);
    if (page.length < PAGE) break;
  }

  const fresh = members.filter((m) => !already.has(m.personId));
  if (fresh.length === 0) return { ok: true, added: 0 };

  // Chunked so one oversized statement cannot fail the whole build.
  for (let i = 0; i < fresh.length; i += PAGE) {
    const { error: insertError } = await companyOs.from("email_campaign_recipients").insert(
      fresh.slice(i, i + PAGE).map((m) => ({
        campaign_id: id,
        person_id: m.personId,
        email: m.email.toLowerCase(),
        status: "pending",
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  await recordAudit({
    table: "email_campaign_recipients",
    recordId: id,
    operation: "bulk_update",
    actor: admin.email,
    context: { added: fresh.length },
  });
  refresh(id);
  return { ok: true, added: fresh.length };
}

export async function clearRecipients(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  if (campaign.status !== "draft") {
    return { ok: false, error: "Recipients can only be cleared while the broadcast is a draft." };
  }

  const { error } = await companyOs.from("email_campaign_recipients").delete().eq("campaign_id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "email_campaign_recipients",
    recordId: id,
    operation: "bulk_delete",
    actor: admin.email,
  });
  refresh(id);
  return { ok: true };
}

// Sends the campaign to the acting admin only. Never touches the recipient list,
// so it can be run as many times as it takes to get the copy right.
export async function sendTest(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };

  const { data: person } = await companyOs
    .from("people")
    .select("id")
    .eq("email", admin.email)
    .maybeSingle();

  if (!person) {
    return { ok: false, error: `No contact in the CRM matches ${admin.email}, so the test cannot be personalised.` };
  }

  const result = await sendMarketingEmail({
    to: admin.email,
    personId: (person as { id: string }).id,
    subject: `[TEST] ${campaign.subject}`,
    preheader: campaign.preheader,
    bodyMd: campaign.bodyMd,
    replyTo: campaign.replyTo,
    campaignId: campaign.id,
    logSource: "marketing_test",
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

// The approval gate. Nothing reaches a recipient without passing through here.
export async function approveBroadcast(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  if (campaign.status !== "draft") {
    return { ok: false, error: `Broadcast is already ${campaign.status}.` };
  }
  if (!campaign.bodyMd.trim()) {
    return { ok: false, error: "Write the email body before approving." };
  }

  const { count } = await companyOs
    .from("email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "pending");

  if (!count) {
    return { ok: false, error: "Build the recipient list before approving." };
  }

  const now = new Date().toISOString();
  const { error } = await companyOs
    .from("email_campaigns")
    .update({ status: "approved", approved_at: now, approved_by: admin.email, updated_at: now })
    .eq("id", id)
    .eq("status", "draft");

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { approved: true, recipients: count },
  });
  refresh(id);
  return { ok: true };
}

export async function cancelBroadcast(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  if (campaign.status === "sent") {
    return { ok: false, error: "A sent broadcast cannot be cancelled." };
  }

  const now = new Date().toISOString();
  const { error } = await companyOs
    .from("email_campaigns")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { cancelled: true, from: campaign.status },
  });
  refresh(id);
  return { ok: true };
}

// Approved -> sending. Separate from approve so the send is a second, deliberate
// press: approving says "this copy is right", starting says "go now".
export async function startSending(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const campaign = await getBroadcast(id);
  if (!campaign) return { ok: false, error: "Broadcast not found." };
  if (campaign.status !== "approved") {
    return { ok: false, error: "Only an approved broadcast can start sending." };
  }

  const now = new Date().toISOString();
  const { error } = await companyOs
    .from("email_campaigns")
    .update({ status: "sending", updated_at: now })
    .eq("id", id)
    .eq("status", "approved");
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { sending: true },
  });
  refresh(id);
  return { ok: true };
}
