import { PageHead } from "@/kernel/ui/PageHead";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { listAdmins, listAdminEmployeeOptions } from "@/entities/company-os/lib/admins";
import { AdminsManager } from "./AdminsManager";

// Settings → Admins. Manages the company_os.admins table that the auth gate
// (lib/admin-auth.ts) checks on every admin request. Entries that come from
// the ADMIN_ALLOWLIST env var show up read-only — they are the break-glass
// fallback and can only be changed on Vercel.

export default async function AdminsPage() {
  const admin = await requireAdmin();
  const [{ rows, error }, employeeOptions] = await Promise.all([
    listAdmins(),
    listAdminEmployeeOptions(),
  ]);

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Admins"
        sub={`${rows.length.toLocaleString()} ${rows.length === 1 ? "admin" : "admins"} can sign in to this console.`}
      />

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <AdminsManager rows={rows} employees={employeeOptions} currentEmail={admin.email} />
    </>
  );
}
