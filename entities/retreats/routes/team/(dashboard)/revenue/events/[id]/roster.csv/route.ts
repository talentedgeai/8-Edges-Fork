// The admin page, served again under /team for members holding the revenue
// permission. It is guarded inside by requireRevenueAccess().
export { GET } from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/[id]/roster.csv/route";
