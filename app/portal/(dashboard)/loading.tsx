// Route-level skeleton: every /portal page is force-dynamic and sits behind a
// middleware auth.getUser() network hop, so without this a navigation shows the
// old page frozen until the server roundtrip completes. Matches the admin/team
// skeletons; .admin-skeleton-bar is already loaded via admin.css in this layout.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="admin-skeleton-bar u-w-90" />
      <div className="admin-skeleton-bar" style={{ width: 280, height: 26, margin: "12px 0 28px" }} />
      <div className="admin-kpi-grid u-mb-0">
        {[0, 1, 2].map((i) => (
          <div className="admin-card u-p-4" key={i}>
            <div className="admin-skeleton-bar u-w-90" />
            <div className="admin-skeleton-bar" style={{ width: 160, height: 22, marginTop: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
