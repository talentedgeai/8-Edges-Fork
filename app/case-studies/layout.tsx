// The route stylesheet loads before the shared sheets, as it did when this
// layout held the body: the cascade order is part of the rendered page.
import './case-studies.css'
import '@/app/styles/site-components.css'
import '@/app/styles/utilities.css'

export { default } from '@/entities/site/routes/case-studies/layout'
