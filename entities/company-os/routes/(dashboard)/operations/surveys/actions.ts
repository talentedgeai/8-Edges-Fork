"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { countEntity } from "@/entities/company-os/lib/query";
import {
  FIELD_TYPES,
  normalizeConfig,
  type FieldType,
  type SurveyStatus,
} from "@/entities/company-os/lib/surveys";
import { slugify } from "@/kernel/config/slug";

type Result = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

function refresh(surveyId?: string) {
  revalidatePath("/admin/operations/surveys");
  if (surveyId) {
    revalidatePath(`/admin/operations/surveys/${surveyId}`);
    revalidatePath(`/admin/operations/surveys/${surveyId}/results`);
  }
}

const hasResponses = async (surveyId: string) =>
  (await countEntity("survey_responses", { survey_id: surveyId })) > 0;

const friendlySlugError = (message: string) =>
  message.includes("duplicate") || message.includes("unique")
    ? "That slug is already taken by another survey."
    : message;

export type SurveyMetaInput = {
  name: string;
  slug: string;
  description: string;
  introText: string;
  thankYouText: string;
  isAnonymous: boolean;
};

export async function createBlankSurvey(): Promise<CreateResult> {
  const admin = await requireAdmin();

  // Create-on-click: drop the operator straight into the builder rather than
  // gating on a separate metadata form. The slug is auto-unique and follows the
  // title while the survey stays a draft (see updateSurveyMeta's auto-sync).
  const slug = `untitled-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const { data, error } = await companyOs
    .from("surveys")
    .insert({
      slug,
      name: "Untitled survey",
      status: "draft",
      is_anonymous: false,
      created_by: admin.email,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the survey." };

  await recordAudit({
    table: "surveys",
    recordId: data.id,
    operation: "insert",
    actor: admin.email,
    newData: { slug, name: "Untitled survey" },
  });
  revalidatePath("/admin/operations/surveys");
  return { ok: true, id: data.id };
}

export async function updateSurveyMeta(id: string, input: SurveyMetaInput): Promise<Result> {
  const admin = await requireAdmin();

  const { data: current, error: cErr } = await companyOs
    .from("surveys")
    .select("slug, name, status, is_anonymous")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !current) return { ok: false, error: cErr?.message ?? "Survey not found." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the survey a name." };
  const slug = slugify(input.slug || name);
  if (!slug) return { ok: false, error: "Give the survey a slug." };
  // Published links are out in the world; the slug is frozen once out of draft.
  if (slug !== current.slug && current.status !== "draft")
    return { ok: false, error: "The slug can only change while the survey is a draft." };
  if (input.isAnonymous !== current.is_anonymous && (await hasResponses(id)))
    return { ok: false, error: "Anonymity cannot change once responses exist." };

  const patch = {
    slug,
    name,
    description: input.description.trim() || null,
    intro_text: input.introText.trim() || null,
    thank_you_text: input.thankYouText.trim() || null,
    is_anonymous: input.isAnonymous,
    updated_at: new Date().toISOString(),
  };
  const { error } = await companyOs.from("surveys").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendlySlugError(error.message) };

  await recordAudit({
    table: "surveys",
    recordId: id,
    operation: "update",
    actor: admin.email,
    oldData: current,
    newData: { slug, name, is_anonymous: input.isAnonymous },
  });
  refresh(id);
  return { ok: true };
}

const ALLOWED_TRANSITIONS: Record<string, SurveyStatus[]> = {
  draft: ["published"],
  published: ["closed"],
  closed: ["published"],
};

export async function setSurveyStatus(id: string, status: SurveyStatus): Promise<Result> {
  const admin = await requireAdmin();

  const { data: survey, error: sErr } = await companyOs
    .from("surveys")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (sErr || !survey) return { ok: false, error: sErr?.message ?? "Survey not found." };
  if (!(ALLOWED_TRANSITIONS[survey.status] ?? []).includes(status))
    return { ok: false, error: `Cannot move a ${survey.status} survey to ${status}.` };

  if (status === "published") {
    const fields = await countEntity("survey_fields", { survey_id: id });
    if (fields === 0) return { ok: false, error: "Add at least one question before publishing." };
  }

  const { error } = await companyOs
    .from("surveys")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "surveys",
    recordId: id,
    operation: "update",
    actor: admin.email,
    oldData: { status: survey.status },
    newData: { status },
  });
  refresh(id);
  return { ok: true };
}

export async function deleteSurvey(id: string): Promise<Result> {
  const admin = await requireAdmin();

  if (await hasResponses(id))
    return { ok: false, error: "This survey has responses and cannot be deleted." };

  const { data: survey } = await companyOs
    .from("surveys")
    .select("slug, name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await companyOs.from("surveys").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "surveys",
    recordId: id,
    operation: "delete",
    actor: admin.email,
    context: { slug: survey?.slug, name: survey?.name },
  });
  refresh(id);
  return { ok: true };
}

export type FieldInput = {
  label: string;
  helpText: string;
  required: boolean;
  choicesText?: string;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
};

export async function addField(
  surveyId: string,
  type: FieldType,
  input: FieldInput,
): Promise<Result> {
  const admin = await requireAdmin();

  if (!FIELD_TYPES.includes(type)) return { ok: false, error: "Pick a question type." };
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Give the question a label." };
  const conf = normalizeConfig(type, input);
  if (!conf.ok) return conf;

  const { data: last } = await companyOs
    .from("survey_fields")
    .select("position")
    .eq("survey_id", surveyId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await companyOs
    .from("survey_fields")
    .insert({
      survey_id: surveyId,
      position: (last?.position ?? -1) + 1,
      type,
      label,
      help_text: input.helpText.trim() || null,
      required: input.required,
      config: conf.config,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed." };

  await recordAudit({
    table: "survey_fields",
    recordId: data.id,
    operation: "insert",
    actor: admin.email,
    newData: { survey_id: surveyId, type, label },
  });
  refresh(surveyId);
  return { ok: true };
}

export async function updateField(fieldId: string, input: FieldInput): Promise<Result> {
  const admin = await requireAdmin();

  const { data: field, error: fErr } = await companyOs
    .from("survey_fields")
    .select("survey_id, type, label, config")
    .eq("id", fieldId)
    .maybeSingle();
  if (fErr || !field) return { ok: false, error: fErr?.message ?? "Question not found." };

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Give the question a label." };

  // Once responses exist, stored answers must stay coherent: wording can be
  // clarified but options/scale (and via a separate rule, the type) are frozen.
  const locked = await hasResponses(field.survey_id);
  const patch: Record<string, unknown> = {
    label,
    help_text: input.helpText.trim() || null,
    required: input.required,
    updated_at: new Date().toISOString(),
  };
  if (!locked) {
    const conf = normalizeConfig(field.type as FieldType, input);
    if (!conf.ok) return conf;
    patch.config = conf.config;
  }

  const { error } = await companyOs.from("survey_fields").update(patch).eq("id", fieldId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "survey_fields",
    recordId: fieldId,
    operation: "update",
    actor: admin.email,
    oldData: { label: field.label },
    newData: { label },
  });
  refresh(field.survey_id);
  return { ok: true };
}

export async function deleteField(fieldId: string): Promise<Result> {
  const admin = await requireAdmin();

  const { data: field, error: fErr } = await companyOs
    .from("survey_fields")
    .select("survey_id, label")
    .eq("id", fieldId)
    .maybeSingle();
  if (fErr || !field) return { ok: false, error: fErr?.message ?? "Question not found." };
  if (await hasResponses(field.survey_id))
    return { ok: false, error: "Questions cannot be deleted once responses exist." };

  const { error } = await companyOs.from("survey_fields").delete().eq("id", fieldId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "survey_fields",
    recordId: fieldId,
    operation: "delete",
    actor: admin.email,
    context: { survey_id: field.survey_id, label: field.label },
  });
  refresh(field.survey_id);
  return { ok: true };
}

export async function moveField(fieldId: string, dir: "up" | "down"): Promise<Result> {
  await requireAdmin();

  const { data: field, error: fErr } = await companyOs
    .from("survey_fields")
    .select("survey_id")
    .eq("id", fieldId)
    .maybeSingle();
  if (fErr || !field) return { ok: false, error: fErr?.message ?? "Question not found." };

  const { data: fields, error: lErr } = await companyOs
    .from("survey_fields")
    .select("id, position")
    .eq("survey_id", field.survey_id)
    .order("position", { ascending: true });
  if (lErr || !fields) return { ok: false, error: lErr?.message ?? "Load failed." };

  const idx = fields.findIndex((f) => f.id === fieldId);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= fields.length) return { ok: true };

  const a = fields[idx];
  const b = fields[swapWith];
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    companyOs.from("survey_fields").update({ position: b.position }).eq("id", a.id),
    companyOs.from("survey_fields").update({ position: a.position }).eq("id", b.id),
  ]);
  const swapError = e1 ?? e2;
  if (swapError) return { ok: false, error: swapError.message };

  refresh(field.survey_id);
  return { ok: true };
}
