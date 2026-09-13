export type ValueRow = { id: string; sort_order: number; title: string; description: string };

export const VALUE_ICONS = ["✦", "▲", "◎", "✓", "✎", "☼"];

// Read-only rendering of the core values, shared by /team/values and the admin
// Company section. Glyphs are presentation-only, keyed by position.
export function CoreValuesGrid({ values }: { values: ValueRow[] }) {
  return (
    <div className="admin-team-values-grid">
      {values.map((v, i) => (
        <div key={v.id} className="admin-team-value-card">
          <span className="admin-team-value-head">
            <span className="admin-team-value-num" aria-hidden>
              {VALUE_ICONS[i % VALUE_ICONS.length]}
            </span>
            <span className="admin-team-value-title">{v.title}</span>
          </span>
          <span className="admin-team-value-body">{v.description}</span>
        </div>
      ))}
    </div>
  );
}
