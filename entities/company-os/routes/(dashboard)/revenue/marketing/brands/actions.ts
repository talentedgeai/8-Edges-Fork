"use server";

import { revalidatePath } from "next/cache";
import { companyOs, type CompanyOsInsert } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

// camelCase field -> db column. Only keys present in the patch are written, so a
// per-tab save never wipes the other tabs' fields.
const FIELD_MAP: Record<string, string> = {
  positioning: "positioning",
  audience: "audience",
  offer: "offer",
  primaryCta: "primary_cta",
  authorMd: "author_md",
  voiceMd: "voice_md",
  rulesMd: "rules_md",
  channelsMd: "channels_md",
  processMd: "process_md",
  blogStylesMd: "blog_styles_md",
  editingLensMd: "editing_lens_md",
  seoLensMd: "seo_lens_md",
  imageStyleMd: "image_style_md",
};

const ARRAY_MAP: Record<string, string> = {
  preferredBlogTypes: "preferred_blog_types",
  preferredImageStyles: "preferred_image_styles",
  preferredSocialStyles: "preferred_social_styles",
};

type BrandProfilePatch = {
  positioning?: string;
  audience?: string;
  offer?: string;
  primaryCta?: string;
  authorMd?: string;
  voiceMd?: string;
  rulesMd?: string;
  channelsMd?: string;
  processMd?: string;
  blogStylesMd?: string;
  editingLensMd?: string;
  seoLensMd?: string;
  imageStyleMd?: string;
  preferredBlogTypes?: string[];
  preferredImageStyles?: string[];
  preferredSocialStyles?: string[];
};

export async function saveBrandProfile(
  brandId: string,
  patch: BrandProfilePatch,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!brandId) return { ok: false, error: "Missing brand." };

  const row: CompanyOsInsert<"brand_profiles"> = {
    brand_id: brandId,
    updated_by: admin.email,
    updated_at: new Date().toISOString(),
  };
  const p = patch as Record<string, string | string[] | undefined>;
  // FIELD_MAP/ARRAY_MAP carry the column names as plain strings, so the writes
  // below are keyed dynamically and TypeScript cannot check them against the
  // row type. One cast here keeps the accumulator itself typed for the insert.
  const columns = row as Record<string, unknown>;
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    const value = p[key];
    if (typeof value === "string") columns[column] = value.trim() || null;
  }
  for (const [key, column] of Object.entries(ARRAY_MAP)) {
    const value = p[key];
    if (Array.isArray(value)) columns[column] = value;
  }

  const { error } = await companyOs.from("brand_profiles").upsert(row, { onConflict: "brand_id" });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "brand_profiles",
    recordId: brandId,
    operation: "update",
    actor: admin.email,
    context: { fields: Object.keys(patch) },
  });
  revalidatePath("/admin/revenue/marketing/brands");
  revalidatePath("/admin/revenue/marketing/broadcasts");
  return { ok: true };
}

// The writer agent's auto-publish switch. Off by default: a run parks at
// "ready" and a person publishes. On: the run publishes the post and re-derives
// the channel assets with no human step.
export async function setBrandAutoPublish(brandId: string, on: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!brandId) return { ok: false, error: "Missing brand." };
  const { error } = await companyOs
    .from("brand_profiles")
    .upsert({ brand_id: brandId, auto_publish: on, updated_by: admin.email, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "brand_profiles", recordId: brandId, operation: "update", actor: admin.email, context: { auto_publish: on } });
  revalidatePath("/admin/revenue/marketing/brands");
  return { ok: true };
}
