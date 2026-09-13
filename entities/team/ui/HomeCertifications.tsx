// The team home's certification band.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real component — today
// entities/team/ui/HomeCertifications.tsx.
//
// Fork note: the tracks it renders come from a partner learning platform that is
// upstream's, so there is nothing to show. Renders nothing rather than an empty
// card, which would leave a heading for a programme the fork does not run.
import type { CertTrack } from "@/entities/team/lib/certifications";

export function HomeCertifications({ tracks }: { tracks: CertTrack[] }) {
  if (tracks.length === 0) return null;
  return null;
}
