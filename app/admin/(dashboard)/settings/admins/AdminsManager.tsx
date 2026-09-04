"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/admin/Badge";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { PersonSelect } from "@/components/admin/PersonSelect";
import { formatDate } from "@/lib/admin/format";
import type { AdminEmployeeOption, AdminListRow } from "@/lib/admin/admins";
import { addAdmin, deleteAdmin, resendAccessLink, updateAdmin } from "./actions";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// Level maps directly onto admins.can_view_sensitive: Super Admins see wages +
// PII, plain Admins do not.
function LevelBadge({ superAdmin }: { superAdmin: boolean }) {
  return superAdmin ? <Badge tone="pink">Super Admin</Badge> : <Badge>Admin</Badge>;
}

export function AdminsManager({
  rows,
  employees,
  currentEmail,
}: {
  rows: AdminListRow[];
  employees: AdminEmployeeOption[];
  currentEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [newPersonId, setNewPersonId] = useState("");
  const [newSuperAdmin, setNewSuperAdmin] = useState(false);

  // Row being edited in the modal, with its draft field values.
  const [editing, setEditing] = useState<{ id: string; name: string; superAdmin: boolean } | null>(
    null,
  );

  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.personId, label: e.name })),
    [employees],
  );
  const selectedEmployee = employees.find((e) => e.personId === newPersonId) ?? null;

  function run(fn: () => Promise<ActionResult>, fallbackOk: string, after?: () => void) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setBanner({ tone: "ok", text: res.message ?? fallbackOk });
        after?.();
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newPersonId) return;
    run(() => addAdmin(newPersonId, newSuperAdmin), "Admin added.", () => {
      setNewPersonId("");
      setNewSuperAdmin(false);
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    run(
      () => updateAdmin(editing.id, { displayName: editing.name, canViewSensitive: editing.superAdmin }),
      "Admin updated.",
      () => setEditing(null),
    );
  }

  function loginStatus(r: AdminListRow) {
    if (r.lastSignInAt) return <Badge tone="ok">Active</Badge>;
    if (r.hasLogin) return <Badge tone="info">Invited</Badge>;
    return <Badge tone="warn">No login yet</Badge>;
  }

  return (
    <>
      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone}`}>{banner.text}</div>
      )}

      <div className="admin-card admin-section-card u-mb-5">
        <h2 className="admin-card-title">Add an admin</h2>
        <form className="admin-form" onSubmit={submitAdd}>
          <div className="u-row u-wrap u-items-end u-gap-3">
            <div className="admin-field u-flex-2 u-mb-0">
              <label className="admin-label" htmlFor="adm-person">Employee</label>
              <PersonSelect
                id="adm-person"
                value={newPersonId}
                onChange={setNewPersonId}
                options={employeeOptions}
                placeholder="Search an employee…"
                ariaLabel="Employee to grant admin access"
                disabled={pending || employeeOptions.length === 0}
              />
            </div>
            <div className="admin-field u-flex-fixed u-mb-0">
              <label className="admin-label" htmlFor="adm-level">Level</label>
              <select
                id="adm-level"
                className="admin-select"
                value={newSuperAdmin ? "super" : "admin"}
                onChange={(e) => setNewSuperAdmin(e.target.value === "super")}
                disabled={pending}
              >
                <option value="admin">Admin</option>
                <option value="super">Super Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={pending || !newPersonId}
            >
              {pending ? "Working…" : "Add & send invite"}
            </button>
          </div>
        </form>
        <p className="admin-cell-muted u-mt-3 u-mb-0">
          {employeeOptions.length === 0 ? (
            "Every active employee already has admin access."
          ) : selectedEmployee ? (
            <>
              Grants <strong>{selectedEmployee.name}</strong> ({selectedEmployee.email}) an email
              link to set their password.{" "}
              {newSuperAdmin
                ? "Super Admins can view wages and PII."
                : "Admins cannot view wages or PII."}
            </>
          ) : (
            "Admins are granted to active employees. Super Admins also get access to sensitive data (wages, PII)."
          )}
        </p>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Level</th>
                <th>Login</th>
                <th>Last sign-in</th>
                <th>Added</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="admin-empty">No admins yet.</div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isSelf = r.email.toLowerCase() === currentEmail.toLowerCase();
                  return (
                    <tr key={r.id ?? `env-${r.email}`}>
                      <td>
                        <div className="admin-cell-strong">{r.displayName || r.email}</div>
                        {r.displayName && <div className="admin-cell-muted">{r.email}</div>}
                        <div className="u-row u-gap-2 u-mt-1">
                          {isSelf && <Badge tone="info">You</Badge>}
                          {r.id && !r.personId && (
                            <span title="This admin isn't linked to an employee record. New admins are added from the employee list.">
                              <Badge tone="warn">Unlinked</Badge>
                            </span>
                          )}
                          {r.source !== "db" && (
                            <span title="Also granted by the ADMIN_ALLOWLIST env var — removing the row here won't revoke access until the env var changes too.">
                              <Badge>Env allowlist</Badge>
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{r.id ? <LevelBadge superAdmin={r.canViewSensitive} /> : <span className="admin-cell-muted">—</span>}</td>
                      <td>{loginStatus(r)}</td>
                      <td className="admin-cell-muted">
                        {r.lastSignInAt ? formatDate(r.lastSignInAt) : "—"}
                      </td>
                      <td className="admin-cell-muted">
                        {r.createdAt ? formatDate(r.createdAt) : "—"}
                        {r.createdBy && <div>by {r.createdBy}</div>}
                      </td>
                      <td>
                        {r.id ? (
                          <div className="u-row u-wrap u-end u-gap-2">
                            <button
                              className="admin-btn admin-btn--sm"
                              disabled={pending}
                              onClick={() =>
                                setEditing({
                                  id: r.id!,
                                  name: r.displayName ?? "",
                                  superAdmin: r.canViewSensitive,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="admin-btn admin-btn--sm"
                              disabled={pending}
                              onClick={() =>
                                run(() => resendAccessLink(r.id!), "Access link sent.")
                              }
                            >
                              {r.hasLogin ? "Send reset link" : "Resend invite"}
                            </button>
                            {!isSelf && (
                              <ConfirmButton
                                className="admin-btn admin-btn--sm admin-btn--danger"
                                label="Remove"
                                title="Remove admin access"
                                body={
                                  <>
                                    <strong>{r.displayName || r.email}</strong> will immediately lose
                                    access to this console. Their login is kept and they can be
                                    re-added later.
                                    {r.source === "both" && (
                                      <>
                                        {" "}They are also in the <code>ADMIN_ALLOWLIST</code> env
                                        var, which still grants access until it is updated on Vercel.
                                      </>
                                    )}
                                  </>
                                }
                                confirmLabel="Remove access"
                                onConfirm={() => deleteAdmin(r.id!)}
                                onDone={() => {
                                  setBanner({ tone: "ok", text: `${r.email} removed.` });
                                  router.refresh();
                                }}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="u-right">
                            <span
                              className="admin-cell-muted"
                              title="Managed via the ADMIN_ALLOWLIST env var on Vercel — add them here to manage them from this page."
                            >
                              via env var
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="admin-modal-backdrop" onClick={() => !pending && setEditing(null)}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit admin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-title">Edit admin</div>
            <form className="admin-form" onSubmit={submitEdit}>
              <div className="admin-field">
                <label className="admin-label" htmlFor="edit-name">Name</label>
                <input
                  id="edit-name"
                  className="admin-input"
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="admin-field">
                <label className="admin-label" htmlFor="edit-level">Level</label>
                <select
                  id="edit-level"
                  className="admin-select"
                  value={editing.superAdmin ? "super" : "admin"}
                  onChange={(e) => setEditing({ ...editing, superAdmin: e.target.value === "super" })}
                >
                  <option value="admin">Admin</option>
                  <option value="super">Super Admin</option>
                </select>
                <p className="admin-cell-muted u-m-0 u-mt-2 u-sm">
                  Super Admins can view and edit wages and PII. Plain Admins cannot.
                </p>
              </div>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => setEditing(null)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
