"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { mergeQuery, type SearchParamsObj } from "@/lib/admin/url";
import type { EmailAudience } from "@/lib/admin/marketing";

// URL-driven so the choice survives a reload and can be linked to. The page
// itself stays a server component and does the filtering; this only rewrites
// the query string.
//
// Uses .admin-viewtoggle, the design system's segmented control (same as the
// Deals and Boards view switchers). Its CSS styles <button> children, so these
// stay buttons rather than links.

const OPTIONS: { key: EmailAudience; label: string }[] = [
  { key: "all", label: "All" },
  { key: "outbound", label: "Sales & marketing" },
  { key: "transactional", label: "Transactional" },
];

export function EmailAudienceToggle({
  active,
  defaultAudience,
  counts,
  searchParams,
}: {
  active: EmailAudience;
  defaultAudience: EmailAudience;
  counts: { all: number; outbound: number; transactional: number };
  searchParams: SearchParamsObj;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(next: EmailAudience) {
    // Selecting the default drops the param rather than pinning it, so the
    // canonical URL stays clean and matches the page's own default.
    const query = mergeQuery(searchParams, { email: next === defaultAudience ? null : next });
    startTransition(() => router.push(`/admin/revenue/marketing${query}`, { scroll: false }));
  }

  return (
    <div className="admin-viewtoggle" role="group" aria-label="Email type">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={option.key === active ? "is-active" : ""}
          aria-pressed={option.key === active}
          disabled={pending}
          onClick={() => select(option.key)}
        >
          {option.label} ({counts[option.key].toLocaleString()})
        </button>
      ))}
    </div>
  );
}
