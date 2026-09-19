import { redirect } from "next/navigation";

// /team/goals folded into the My Coach page (K.18): the goal tab there renders
// the same MyGoalsPanel this route used to render, so the two screens can no
// longer drift. The route stays as a redirect because old links, bookmarks and
// the onboarding docs still point here.
export default async function MyGoalsPage() {
  redirect("/team/my-coaching?tab=goals");
}
