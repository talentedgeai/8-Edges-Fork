import { redirect } from "next/navigation";
import { surfaceBase } from "@/kernel/shell/surface";

// Renamed: /admin/revenue/registrations → /admin/revenue/public-retreats →
// /admin/revenue/events. Kept as a redirect so old bookmarks/links keep working.
export default function RegistrationsRedirect() {
  redirect(`${surfaceBase()}/revenue/events`);
}
