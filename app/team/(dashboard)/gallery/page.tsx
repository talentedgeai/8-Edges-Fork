import { requireTeamMember } from "@/lib/team-auth";
import { PageHead } from "@/components/admin/PageHead";
import { listGalleryPhotos, taggablePeople } from "@/lib/gallery";
import { GalleryBrowser } from "@/components/team/GalleryBrowser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery", description: "Photos from the Edge8 team." };

// Company photo wall. Company-visible (no per-actor scope); admins add photos in
// /admin/operations/gallery. Public-bucket images, so a plain <img>. Any team
// member can tag the people in a photo.
export default async function TeamGalleryPage() {
  await requireTeamMember();
  const [photos, taggable] = await Promise.all([listGalleryPhotos(), taggablePeople()]);

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Gallery"
        sub={`${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
      />
      {photos.length === 0 ? (
        <div className="admin-empty">No photos yet. Check back soon.</div>
      ) : (
        <GalleryBrowser photos={photos} taggable={taggable} />
      )}
    </>
  );
}
