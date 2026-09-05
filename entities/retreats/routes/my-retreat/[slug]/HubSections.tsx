import type { RetreatResource } from "@/entities/retreats/my-retreat/content";

// Presentational hub sections (server components). No client interactivity —
// survey cards are links that flip to a "done" state once a matching response
// exists for this guest.

export type SurveyCard = {
  stage: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
};

export function SurveyCards({ items }: { items: SurveyCard[] }) {
  if (items.length === 0) return null;
  return (
    <section className="u-mt-7">
      <h2 className="site-h-20 u-m-0 u-mb-4">Your surveys</h2>
      <div className="site-retreat-grid">
        {items.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className={`site-retreat-card${s.completed ? " is-done" : ""}`}
          >
            <div className="u-dim u-label">
              {s.stage}
            </div>
            <div className="u-strong u-m-0 u-mt-1 u-mb-2">{s.title}</div>
            <p className="u-m-0 u-mb-3 u-lg u-dim-2">{s.description}</p>
            <span className={`site-item-title${s.completed ? " u-ok-strong" : ""}`}>
              {s.completed ? "✓ Completed. Edit your answers" : "Open survey →"}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function ResourceCards({ resources }: { resources: RetreatResource[] }) {
  if (resources.length === 0) return null;
  return (
    <section className="u-mt-7">
      <h2 className="site-h-20 u-m-0 u-mb-4">Resources</h2>
      <div className="site-retreat-grid">
        {resources.map((r) => (
          <a
            key={r.href}
            href={r.href}
            className="site-retreat-card"
            target={r.href.startsWith("http") ? "_blank" : undefined}
            rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {r.eyebrow && (
              <div className="u-dim u-label">
                {r.eyebrow}
              </div>
            )}
            <div className="u-strong u-m-0 u-mt-1 u-mb-2">{r.title}</div>
            {r.description && <p className="u-m-0 u-mb-3 u-lg u-dim-2">{r.description}</p>}
            <span className="u-lg u-strong">Open →</span>
          </a>
        ))}
      </div>
    </section>
  );
}
