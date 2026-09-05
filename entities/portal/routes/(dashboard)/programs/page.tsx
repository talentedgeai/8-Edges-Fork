import { redirect } from "next/navigation";

// The AI Programs list now lives on /portal/hub (one list for the portal). This
// route stays so old links and the create flow's parent path still resolve.
export default function AiProgramsIndexPage() {
  redirect("/portal/hub");
}
