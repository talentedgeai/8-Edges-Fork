import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getOrgChart, getOpenRoles } from "@/entities/team/lib/data";
import { PageHead } from "@/kernel/ui/PageHead";
import { OrgChart } from "@/entities/company-os";

export const metadata = {
  title: "Org Chart",
  description: "How Edge8 fits together: the reporting tree, live from the directory.",
};

// /team/org — the reporting tree, read-only and company-visible like the
// directory. The tree itself lives in components/company/OrgChart, shared with
// the admin Company section; here it links to the team directory.
export default async function TeamOrgPage() {
  await requireTeamMember();
  const [entries, openRoles] = await Promise.all([getOrgChart(), getOpenRoles()]);
  const openCount = openRoles.length;

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Org Chart"
        sub={`${entries.length} people${openCount ? ` · ${openCount} open ${openCount === 1 ? "role" : "roles"}` : ""} · live from the directory`}
      />

      <OrgChart entries={entries} openRoles={openRoles} personHref={(id) => `/team/directory/${id}`} />
    </>
  );
}
