import { PageHead } from "@/kernel/ui/PageHead";
import { GalleryManager } from "@/entities/company-os/ui/GalleryManager";
import { listGalleryPhotos, taggablePeople } from "@/entities/site";

export const metadata = { title: "Gallery" };

// Admin gallery management. requireAdmin() runs in the dashboard layout; every
// write action re-checks it.
export default async function AdminGalleryPage() {
  const [photos, taggable] = await Promise.all([listGalleryPhotos(), taggablePeople()]);
  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Gallery"
        sub="Team photos — shown to everyone on the /team home and gallery."
      />
      <GalleryManager photos={photos} taggable={taggable} />
    </>
  );
}
