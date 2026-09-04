"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { archiveCompany } from "../companies/actions";

// Per-row actions for the Clients list. Both controls stop propagation so a
// click (or the ConfirmButton modal/backdrop) never bubbles to the row and
// opens the shelf. Rows here are always active (the list excludes archived),
// so Archive is the only lifecycle action offered.
export function ClientRowActions({ id, name }: { id: string; name: string | null }) {
  const router = useRouter();

  return (
    <span
      className="u-row u-end"
      onClick={(e) => e.stopPropagation()}
    >
      <Link
        href={`/admin/revenue/companies/${id}`}
        className="admin-btn admin-btn--sm"
        onClick={(e) => e.stopPropagation()}
      >
        View
      </Link>
      <ConfirmButton
        className="admin-btn admin-btn--sm"
        label="Archive"
        title="Archive this client?"
        body={`${name || "This company"} will be hidden from the clients list. You can restore it any time.`}
        confirmLabel="Archive"
        onConfirm={() => archiveCompany(id)}
        onDone={() => router.refresh()}
      />
    </span>
  );
}
