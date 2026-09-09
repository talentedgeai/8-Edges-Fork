import { redirect } from "next/navigation";

// Time Off is split into Requests (approve/track leave) and History (policies,
// schedules, balances). The section index lands on Requests.
export default function TimeOffIndexPage() {
  redirect("/admin/operations/time-off/requests");
}
