// The hand-built entries of the private workflows library, one list per brand.
// Read by lib/stats.ts for the documented-workflows count on the public site.
//
// Fork note: upstream's copy is a directory of client and internal work —
// engagement backlogs, acceptance reports, named prototypes — so it is on the
// exclude list (.github/fork-sync-exclude.txt) and never reaches this repo.
//
// This stub exists because lib/stats.ts imports `allPrivateItems` at module
// scope. Without it the fork does not COMPILE: `next build` fails with
// "Module not found: Can't resolve '@/lib/privateLibraryData'", which means
// `vercel --prod` can never succeed. Excluding a module without replacing it
// is only safe when nothing imports it.
//
// The lists are empty by design. getDocumentedWorkflowsTotal() then counts the
// public /workflows directory plus docs published to Storage, which is the
// correct number for a fresh install that has no private library yet.
//
// If you build your own private library, populate these lists — the shape below
// is the whole contract lib/stats.ts relies on.

export type LibraryCategory = 'plan' | 'workflow' | 'prototype' | 'data'

export type LibraryItem = {
  href: string
  title: string
  description: string
  category: LibraryCategory
}

export const e8PrivateItems: LibraryItem[] = []
export const aioPrivateItems: LibraryItem[] = []
export const whaPrivateItems: LibraryItem[] = []

export const allPrivateItems: LibraryItem[] = [
  ...e8PrivateItems,
  ...aioPrivateItems,
  ...whaPrivateItems,
]
