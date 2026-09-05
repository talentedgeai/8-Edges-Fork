import Link from "next/link";
import type { GalleryPhoto, CollageAvatar } from "@/entities/site";
import { initials } from "@/kernel/ui/format";

// The people band on /team home: a fixed photo–face–photo–face rhythm rather
// than a loose wrap, so the composition holds whatever the random draw returns.
// Faces link to the member's profile; photos open the gallery. Server
// component — no client JS. Renders nothing when there's nothing to show.
export function TeamCollage({ photos, avatars }: { photos: GalleryPhoto[]; avatars: CollageAvatar[] }) {
  if (photos.length === 0 && avatars.length === 0) return null;

  const tiles: React.ReactNode[] = [];
  // Strict alternation: photo, face, photo, face… — whichever list runs out
  // first simply stops contributing and the rhythm closes up.
  for (let i = 0; i < Math.max(photos.length, avatars.length); i++) {
    const p = photos[i];
    if (p) {
      tiles.push(
        <Link key={`p${p.id}`} className="admin-team-collage-photo" href="/team/gallery" title={p.caption || "Open the gallery"}>
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
          <img src={p.image_url} alt={p.caption || "Team photo"} loading="lazy" decoding="async" />
          {p.caption && <span className="admin-team-collage-cap">{p.caption}</span>}
        </Link>,
      );
    }
    const a = avatars[i];
    if (a) {
      tiles.push(
        <Link key={`a${a.id}`} className="admin-avatar admin-avatar--xl" href={`/team/directory/${a.id}`} title={a.name}>
          {a.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
            <img src={a.avatarUrl} alt={a.name} loading="lazy" decoding="async" />
          ) : (
            <span>{initials(a.name)}</span>
          )}
        </Link>,
      );
    }
  }

  return <div className="admin-team-collage">{tiles}</div>;
}
