import type { ReactNode } from "react";

export function PageHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-head">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="admin-eyebrow">{eyebrow}</div>}
        <h1 className="admin-page-title">{title}</h1>
        {sub && <p className="admin-page-sub">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
