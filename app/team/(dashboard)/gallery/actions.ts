"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/team-auth";
import { addPhotoTag, removePhotoTag, type Result } from "@/lib/gallery";

// Self-serve photo tagging from /team/gallery. Any team member may tag people in
// a company photo (the gallery is company-visible, not per-actor). The gate is
// requireTeamMember(); writes go through the service-role client in lib/gallery.

function revalidate() {
  revalidatePath("/team/gallery");
  revalidatePath("/team");
}

export async function tagPhotoPerson(photoId: string, personId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const res = await addPhotoTag(photoId, personId, actor.personId);
  if (res.ok) revalidate();
  return res;
}

export async function untagPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requireTeamMember();
  const res = await removePhotoTag(photoId, personId);
  if (res.ok) revalidate();
  return res;
}
