// Team photo gallery: upload to the public `gallery` bucket and track each
// photo in company_os.gallery_photos. Admin-managed (add/caption/delete),
// team-visible (browse + the home collage). Authorization is the caller's job —
// admin actions call requireAdmin() first.

import { supabase, companyOs } from "@/kernel/data/supabase";

const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// The vocabulary and row shapes live in ./gallery-types so the client door can
// hand them to the browser without this file's Supabase client; the server
// callers of this module still find the row shapes they read here.
export { type CollageAvatar, type GalleryPhoto, type Result, type TaggablePerson } from "./gallery-types";
import {
  cleanCategory,
  type CollageAvatar,
  type GalleryPhoto,
  type Result,
  type TaggablePerson,
  type TaggedPerson,
} from "./gallery-types";

const SELECT = "id, image_url, caption, taken_on, category, created_at";

// Newest upload first, each photo carrying its people tags.
export async function listGalleryPhotos(): Promise<GalleryPhoto[]> {
  const { data } = await companyOs
    .from("gallery_photos")
    .select(SELECT)
    .order("created_at", { ascending: false });
  return attachTags((data ?? []) as GalleryPhoto[]);
}

// One extra query for all the tags on a page of photos, folded back onto each
// row. The gallery is small and admin-curated, so a single IN beats a nested
// PostgREST embed (which needs an FK hint here — two FKs point at people).
async function attachTags(photos: GalleryPhoto[]): Promise<GalleryPhoto[]> {
  if (photos.length === 0) return photos;
  const { data } = await companyOs
    .from("gallery_photo_people")
    .select("photo_id, person_id, people:people!person_id(preferred_name, full_name, avatar_url)")
    .in("photo_id", photos.map((p) => p.id));
  type P = { preferred_name: string | null; full_name: string | null; avatar_url: string | null };
  const byPhoto = new Map<string, TaggedPerson[]>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const raw = row.people as P | P[] | null;
    const p = Array.isArray(raw) ? raw[0] ?? null : raw;
    const list = byPhoto.get(row.photo_id as string) ?? [];
    list.push({
      person_id: row.person_id as string,
      name: p?.preferred_name || p?.full_name || "Unknown",
      avatar_url: p?.avatar_url ?? null,
    });
    byPhoto.set(row.photo_id as string, list);
  }
  for (const list of byPhoto.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return photos.map((p) => ({ ...p, people: byPhoto.get(p.id) ?? [] }));
}

// Fisher–Yates. The home page renders per-request (force-dynamic), so a plain
// Math.random here is what makes the collage rotate on every load.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A fresh random draw from the whole gallery on every load. The table is small
// (admin-curated), so shuffling in memory beats a DB-side random order.
export async function randomGalleryPhotos(limit: number): Promise<GalleryPhoto[]> {
  const { data } = await companyOs.from("gallery_photos").select(SELECT);
  return shuffle((data ?? []) as GalleryPhoto[]).slice(0, limit);
}


// A random draw of current team members for the home collage; members with a
// photo fill the band first so it's faces, not initials.
export async function collageAvatars(limit: number): Promise<CollageAvatar[]> {
  const { data } = await companyOs
    .from("team_members")
    .select("id, people:people!person_id(full_name, preferred_name, avatar_url)")
    .in("status", ["active", "on_leave", "notice"]);
  type P = { full_name: string | null; preferred_name: string | null; avatar_url: string | null };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const raw = r.people as P | P[] | null;
    const p = Array.isArray(raw) ? raw[0] ?? null : raw;
    return { id: r.id as string, name: p?.preferred_name || p?.full_name || "?", avatarUrl: p?.avatar_url ?? null };
  });
  const withAvatar = shuffle(rows.filter((r) => r.avatarUrl));
  const withoutAvatar = shuffle(rows.filter((r) => !r.avatarUrl));
  return [...withAvatar, ...withoutAvatar].slice(0, limit);
}

// Photos upload straight from the browser to storage so there's no serverless
// body limit and no file goes through our functions. Step 1: mint a one-shot
// signed upload URL for a fresh path (service-role). The client PUTs the file
// to it (with progress); then step 2 records the row.
export async function signedGalleryUpload(
  contentType: string,
): Promise<{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }> {
  const ext = MIME_EXT[contentType];
  if (!ext) return { ok: false, error: "Use a JPG, PNG, or WebP image." };
  const path = `photos/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from("gallery").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload." };
  return { ok: true, signedUrl: data.signedUrl, path };
}

// Step 2: once the object is in the bucket, record it. The bucket is public, so
// the row just stores its public URL.
export async function recordGalleryPhoto(
  path: string,
  uploadedBy: string,
  category?: string | null,
): Promise<Result> {
  const { data: pub } = supabase.storage.from("gallery").getPublicUrl(path);
  const { error } = await companyOs
    .from("gallery_photos")
    .insert({ image_url: pub.publicUrl, storage_path: path, uploaded_by: uploadedBy, category: cleanCategory(category) });
  if (error) {
    await supabase.storage.from("gallery").remove([path]); // don't orphan the object
    return { ok: false, error: "Could not save the photo." };
  }
  return { ok: true };
}

export async function updateGalleryPhoto(
  id: string,
  fields: { caption?: string | null; taken_on?: string | null; category?: string | null },
): Promise<Result> {
  const patch: Record<string, unknown> = {};
  if ("caption" in fields) patch.caption = fields.caption?.trim() || null;
  if ("taken_on" in fields) patch.taken_on = fields.taken_on || null;
  if ("category" in fields) patch.category = cleanCategory(fields.category);
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await companyOs.from("gallery_photos").update(patch).eq("id", id);
  return error ? { ok: false, error: "Could not save." } : { ok: true };
}

export async function deleteGalleryPhoto(id: string): Promise<Result> {
  const { data } = await companyOs.from("gallery_photos").select("storage_path").eq("id", id).maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  const { error } = await companyOs.from("gallery_photos").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete." };
  if (path) await supabase.storage.from("gallery").remove([path]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Photo tagging
// ---------------------------------------------------------------------------

// Tag a person in a photo. Idempotent: re-tagging the same person is a no-op.
// taggedBy is the tagger's people.id (null when unknown, e.g. an admin acting by
// email). Callers must gate on requireAdmin()/requireTeamMember() first.
export async function addPhotoTag(
  photoId: string,
  personId: string,
  taggedBy: string | null,
): Promise<Result> {
  const { error } = await companyOs
    .from("gallery_photo_people")
    .upsert(
      { photo_id: photoId, person_id: personId, tagged_by: taggedBy },
      { onConflict: "photo_id,person_id", ignoreDuplicates: true },
    );
  return error ? { ok: false, error: "Could not add the tag." } : { ok: true };
}

export async function removePhotoTag(photoId: string, personId: string): Promise<Result> {
  const { error } = await companyOs
    .from("gallery_photo_people")
    .delete()
    .eq("photo_id", photoId)
    .eq("person_id", personId);
  return error ? { ok: false, error: "Could not remove the tag." } : { ok: true };
}


// Current staff, for the "tag someone" picker: the same set the directory shows
// (active, on leave, or on notice), one entry per person, name-sorted.
export async function taggablePeople(): Promise<TaggablePerson[]> {
  const { data } = await companyOs
    .from("team_members")
    .select("person_id, people:people!person_id(preferred_name, full_name, avatar_url)")
    .in("status", ["active", "on_leave", "notice"]);
  type P = { preferred_name: string | null; full_name: string | null; avatar_url: string | null };
  const byPerson = new Map<string, TaggablePerson>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const personId = row.person_id as string | null;
    if (!personId || byPerson.has(personId)) continue;
    const raw = row.people as P | P[] | null;
    const p = Array.isArray(raw) ? raw[0] ?? null : raw;
    byPerson.set(personId, {
      person_id: personId,
      name: p?.preferred_name || p?.full_name || "Unknown",
      avatar_url: p?.avatar_url ?? null,
    });
  }
  return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));
}
