"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { setProgramStatus, type AdminProgramStatus } from "@/entities/company-os/modules/crm/program-actions";

// The status verbs on the admin program header: mark complete / reactivate,
// and archive. Archiving hides the program everywhere (this page 404s
// afterwards), so it confirms first and then returns to the company hub.
export function ProgramStatusActions({
  companyId,
  programId,
  programName,
  status,
}: {
  companyId: string;
  programId: string;
  programName: string;
  status: AdminProgramStatus | "draft";
}) {
  const router = useRouter();
  const hubHref = `/admin/revenue/companies/${companyId}?view=hub`;
  const set = (next: AdminProgramStatus) => () => setProgramStatus(companyId, programId, next);

  return (
    <span className="u-row u-wrap">
      {status === "complete" ? (
        <ConfirmButton
          label="Reactivate"
          className="admin-btn admin-btn--sm"
          title={`Reactivate "${programName}"?`}
          body="The program goes back to Active."
          confirmLabel="Reactivate"
          onConfirm={set("active")}
          onDone={() => router.refresh()}
        />
      ) : (
        <ConfirmButton
          label="Mark complete"
          className="admin-btn admin-btn--sm"
          title={`Mark "${programName}" complete?`}
          body="The program stays listed with a Complete badge. You can reactivate it later."
          confirmLabel="Mark complete"
          onConfirm={set("complete")}
          onDone={() => router.refresh()}
        />
      )}
      <ConfirmButton
        label="Archive"
        className="admin-btn admin-btn--sm admin-btn--danger"
        title={`Archive "${programName}"?`}
        body="The program disappears from the Client Hub, the team hub and the client portal. Its roadmap, board, documents and meetings are kept. Undoing this needs a database change."
        confirmLabel="Archive"
        onConfirm={set("archived")}
        onDone={() => router.push(hubHref)}
      />
    </span>
  );
}
