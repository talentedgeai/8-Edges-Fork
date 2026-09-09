// The route stylesheet loads before the shared sheets, as it did when this
// layout held the body: the cascade order is part of the rendered page, so the
// sheets stay in app/ while the layout itself lives in the library entity.
import './workflows.css'
import '@/app/styles/site-components.css'
import '@/app/styles/utilities.css'

export { default, metadata } from '@/entities/library/routes/workflows/layout'
