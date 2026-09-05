// Thin composer: the layout lives in the billing entity (ME-05). The
// stylesheets stay here — two of them live under app/, which an entity may not
// import — and they keep the exact order the cascade had before the move:
// workflows.css, then the entity's plans.css, then the shared site sheets.
import '@/app/workflows/workflows.css'
import '@/entities/billing/routes/plans/plans.css'
import '@/app/styles/site-components.css'
import '@/app/styles/utilities.css'

export { default } from '@/entities/billing/routes/plans/layout'
