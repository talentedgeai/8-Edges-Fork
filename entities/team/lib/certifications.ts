// An employee's AI Officer Institute certification progress, for the /team home
// "Get certified" section. The two tracks are AI Officer and AI Engineer.
//
// The progress is read from the person's own record (people.metadata.
// certifications), which is where the AI Officer Institute sync writes each
// member's status. Until that sync runs for a person the tracks read
// "not started", which is a real state, never a fabricated number. Keeping the
// read here means the home page never reaches into the metadata shape directly,
// and the writer (the sync from the AI Officer database) can land separately.

export type CertStatus = "not_started" | "in_progress" | "certified";

export type CertTrack = {
  key: "ai_officer" | "ai_engineer";
  label: string;
  status: CertStatus;
  completed: number; // modules finished
  total: number; // modules in the track
};

const TRACKS: ReadonlyArray<{ key: CertTrack["key"]; label: string }> = [
  { key: "ai_officer", label: "AI Officer" },
  { key: "ai_engineer", label: "AI Engineer" },
];

function readTrack(raw: unknown): { status: CertStatus; completed: number; total: number } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const completed = Number(r.completed ?? 0) || 0;
  const total = Number(r.total ?? 0) || 0;
  const status: CertStatus =
    r.status === "certified" || r.status === "in_progress" || r.status === "not_started"
      ? r.status
      : total > 0 && completed >= total
        ? "certified"
        : completed > 0
          ? "in_progress"
          : "not_started";
  return { status, completed, total };
}

// Reads the certification tracks off a person's metadata. `metadata` is the
// raw people.metadata json the profile loader already carries, so this adds no
// query. Always returns both tracks, in a fixed order.
export function readCertifications(metadata: unknown): CertTrack[] {
  const certs = ((metadata as Record<string, unknown> | null)?.certifications ?? {}) as Record<string, unknown>;
  return TRACKS.map((t) => ({ key: t.key, label: t.label, ...readTrack(certs[t.key]) }));
}
