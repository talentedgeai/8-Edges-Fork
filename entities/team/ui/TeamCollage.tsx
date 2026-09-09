import Link from "next/link";
import type { GalleryPhoto, CollageAvatar } from "@/entities/site";
import { initials } from "@/kernel/ui/format";

// The people band on /team home: a row of equal landscape tiles (a 3:2 ratio
// close to how the photos are shot, so cover fills each tile without cropping
// heads), plus a tile of overlapping faces that opens the directory. Empty
// photo slots fall back to a soft tile so the row keeps its shape. Server
// component, no client JS.

function PhotoTile({ photo }: { photo: GalleryPhoto | undefined }) {
  if (!photo) return <span className="admin-team-gallery-photo admin-team-gallery-empty" aria-hidden />;
  return (
    <Link className="admin-team-gallery-photo" href="/team/gallery" title={photo.caption || "Open the gallery"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
      <img src={photo.image_url} alt={photo.caption || "Team photo"} loading="lazy" decoding="async" />
      {photo.caption && <span className="admin-team-gallery-cap">{photo.caption}</span>}
    </Link>
  );
}

export function TeamCollage({ photos, avatars }: { photos: GalleryPhoto[]; avatars: CollageAvatar[] }) {
  if (photos.length === 0 && avatars.length === 0) return null;

  const shown = [photos[0], photos[1], photos[2]];
  const faces = avatars.slice(0, 4);

  return (
    <div className="admin-team-gallery">
      {shown.map((p, i) => (
        <PhotoTile key={p?.id ?? `empty-${i}`} photo={p} />
      ))}
      <Link className="admin-team-gallery-faces" href="/team/directory" title="The team directory">
        <div className="admin-team-gallery-faces-row">
          {faces.map((a) => (
            <span key={a.id} className="admin-team-gallery-face" title={a.name}>
              {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                <img src={a.avatarUrl} alt={a.name} loading="lazy" decoding="async" />
              ) : (
                <span>{initials(a.name)}</span>
              )}
            </span>
          ))}
        </div>
        <span className="admin-team-gallery-faces-label">The team →</span>
      </Link>
    </div>
  );
}
