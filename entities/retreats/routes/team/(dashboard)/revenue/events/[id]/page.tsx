// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requireRevenueAccess } from "@/kernel/identity/revenue-access";
import AdminPage from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/[id]/page";

export default async function TeamEventDetailPage(props: { params: { id: string } }) {
  await requireRevenueAccess();
  return <AdminPage {...props} />;
}
