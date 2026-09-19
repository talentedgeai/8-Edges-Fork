// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requireRevenueAccess } from "@/kernel/identity/revenue-access";
import AdminPage from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/page";
export { metadata } from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/page";

export default async function TeamEventsPage() {
  await requireRevenueAccess();
  return <AdminPage />;
}
