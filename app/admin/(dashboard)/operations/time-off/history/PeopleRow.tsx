"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent, KeyboardEvent } from "react";

// Whole-row navigation target for the Time Off → People table. The entire row
// is the click surface (design system: the name is not a separate link) and
// activating it opens the team member's full profile. Cmd/Ctrl or middle click
// opens in a new tab, matching a real link. Clicks that land on a genuinely
// interactive element inside the row are left alone so inline controls still work.
export function PeopleRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  function onAuxClick(e: MouseEvent<HTMLTableRowElement>) {
    if (e.button !== 1 || hitsInnerInteractive(e)) return;
    window.open(href, "_blank", "noopener");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" && !hitsInnerInteractive(e)) {
      e.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr
      className="is-clickable"
      onClick={onClick}
      onAuxClick={onAuxClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="link"
    >
      {children}
    </tr>
  );
}
