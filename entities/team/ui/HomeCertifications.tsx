import type { CertTrack } from "@/entities/team/lib/certifications";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";

// The "Get certified" rail card on /team home: progress on the two AI Officer
// Institute tracks (AI Officer and AI Engineer), read from the person's record.
// Sized for the narrow rail; the label sits outside the card like the client
// view. Presentational; the page passes the tracks in.

const STATUS_LABEL: Record<CertTrack["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  certified: "Certified",
};
const STATUS_TONE: Record<CertTrack["status"], BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  certified: "ok",
};

const INSTITUTE_URL = "https://aiolabz.com";

export function HomeCertifications({ tracks }: { tracks: CertTrack[] }) {
  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Get certified</h2>
        <a className="admin-cell-muted u-sm" href={INSTITUTE_URL} target="_blank" rel="noopener noreferrer">
          AI Officer Institute →
        </a>
      </div>
      <div className="admin-card admin-section-card u-mb-4">
        <div className="admin-list">
          {tracks.map((t) => {
            const pct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : t.status === "certified" ? 100 : 0;
            return (
              <div className="admin-list-row" key={t.key}>
                <div className="admin-list-main u-min-0">
                  <div className="admin-list-title">{t.label}</div>
                  <div className="admin-progress u-mt-2">
                    <div className="admin-progress-fill" data-p={Math.round(pct / 10) * 10} />
                  </div>
                  {t.total > 0 && <div className="admin-cell-muted u-sm u-mt-1">{t.completed} of {t.total} modules</div>}
                </div>
                <div className="admin-list-aside">
                  <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
