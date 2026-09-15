// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requireRevenueAccess } from "@/kernel/identity/revenue-access";
import AdminPage from "@/entities/crm/routes/admin/(dashboard)/revenue/meetings/page";
export { metadata } from "@/entities/crm/routes/admin/(dashboard)/revenue/meetings/page";

export default async function TeamMeetingsPage(props: { searchParams: import("@/kernel/ui/url").SearchParamsObj }) {
  await requireRevenueAccess();
  return <AdminPage {...props} />;
}
