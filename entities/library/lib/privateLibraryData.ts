// The hand-built entries of the private workflows library, one list per brand.
// Read through the library entity's door for the documented-workflows count on
// the public site (entities/library/lib/stats.ts since Q2).
//
// Fork note: upstream's copy is a directory of client and internal work —
// engagement backlogs, acceptance reports, named prototypes — so it is on the
// exclude list (.github/fork-sync-exclude.txt) and never reaches this repo.
// ME-10 moved it from lib/privateLibraryData.ts into the library entity, so
// this stub moved with it; ME-13 deleted the old-path shim, and the fork tree
// has no lib/ at all (.github/scripts/fork-sync.test.mjs asserts it).
//
// This stub exists because entities/library/lib/stats.ts imports `allPrivateItems`
// at module scope. Without it the fork does not COMPILE: `next build` fails with
// "Module not found: Can't resolve '@/entities/library/lib/privateLibraryData'",
// which means `vercel --prod` can never succeed. Excluding a module without
// replacing it is only safe when nothing imports it.
//
// The lists are empty by design. getDocumentedWorkflowsTotal() then counts the
// public /workflows directory plus docs published to Storage, which is the
// correct number for a fresh install that has no private library yet.
//
// If you build your own private library, populate these lists — the shape below
// is the whole contract entities/site/lib/stats.ts relies on.

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
