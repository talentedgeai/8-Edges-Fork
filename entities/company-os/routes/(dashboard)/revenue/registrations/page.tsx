import { redirect } from "next/navigation";

// Renamed: /admin/revenue/registrations → /admin/revenue/public-retreats →
// /admin/revenue/events. Kept as a redirect so old bookmarks/links keep working.
export default function RegistrationsRedirect() {
  redirect("/admin/revenue/events");
}
