import { companyOs } from '@/kernel/data/supabase'
// The documented-workflows count is three numbers out of this entity's own
// lists, which is why the module lives here (Q2): the public site's /api/stats
// and the admin Marketing overview both take it through the library's index,
// so the site never has to reach the library from inside its own door graph.
// It is a server module: listDocs reads Supabase Storage with the service-role
// client, so a client component must not import it.
import { listDocs } from './docs'
import { allWorkflows } from './workflowsData'
import { allPrivateItems } from './privateLibraryData'

// Year-goal source numbers, shared by the public /api/stats endpoint and the
// admin Marketing overview so the two always report the same figure.

// Annual targets. The canonical source is scripts/edges/collect-metrics.mjs
// (YEAR_GOALS); mirrored here as constants for the UIs that draw progress bars.
export const KEYNOTE_ATTENDEES_GOAL = 1000
export const DOCUMENTED_WORKFLOWS_GOAL = 100

export async function getWorkshopAttendeesTotal(): Promise<number | null> {
  try {
    const { data, error } = await companyOs.rpc('workshop_attendees_total', {
      p_year: new Date().getFullYear(),
    })
    if (error) throw error
    return typeof data === 'number' ? data : null
  } catch {
    return null
  }
}

// One number for "documented workflows", public and private: the public
// /workflows directory, the workflow-category entries of the private library
// (all brands), and docs published to Storage via scripts/docs/publish.mjs.
// Only a count is ever exposed; private titles never leave this function.
export async function getDocumentedWorkflowsTotal(): Promise<number | null> {
  try {
    const docs = await listDocs()
    const docHrefs = new Set(docs.map((d) => `/workflows/private/e8/${d.slug}`))
    const privateWorkflows = allPrivateItems.filter(
      (i) => i.category === 'workflow' && !docHrefs.has(i.href)
    )
    return allWorkflows.length + privateWorkflows.length + docs.length
  } catch {
    return null
  }
}
