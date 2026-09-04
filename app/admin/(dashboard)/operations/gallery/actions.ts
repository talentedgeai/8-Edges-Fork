"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import {
  signedGalleryUpload,
  recordGalleryPhoto,
  updateGalleryPhoto,
  deleteGalleryPhoto,
  addPhotoTag,
  removePhotoTag,
  type Result,
} from "@/lib/gallery";

// All gallery writes are admin-only. The team side is read-only.

function revalidate() {
  revalidatePath("/admin/operations/gallery");
  revalidatePath("/team/gallery");
  revalidatePath("/team");
}

// Step 1 of the direct-to-storage upload: hand the client a one-shot signed
// upload URL. The file never passes through the server.
export async function createGalleryUpload(contentType: string) {
  await requireAdmin();
  return signedGalleryUpload(contentType);
}

// Step 2: record the object the client just uploaded, with its category.
export async function recordGalleryUpload(path: string, category: string): Promise<Result> {
  const admin = await requireAdmin();
  const res = await recordGalleryPhoto(path, admin.email, category);
  if (res.ok) revalidate();
  return res;
}

export async function saveGalleryPhoto(
  id: string,
  caption: string,
  takenOn: string,
  category: string,
): Promise<Result> {
  await requireAdmin();
  const res = await updateGalleryPhoto(id, { caption, taken_on: takenOn, category });
  if (res.ok) revalidate();
  return res;
}

export async function removeGalleryPhoto(id: string): Promise<Result> {
  await requireAdmin();
  const res = await deleteGalleryPhoto(id);
  if (res.ok) revalidate();
  return res;
}

// Tag / untag a person in a photo. tagged_by is left null for admins (they act
// by email, not a people.id).
export async function tagGalleryPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requireAdmin();
  const res = await addPhotoTag(photoId, personId, null);
  if (res.ok) revalidate();
  return res;
}

export async function untagGalleryPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requireAdmin();
  const res = await removePhotoTag(photoId, personId);
  if (res.ok) revalidate();
  return res;
}
