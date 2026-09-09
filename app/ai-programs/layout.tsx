// The route stylesheet loads before the shared sheets, as it did when this
// layout held the body: the cascade order is part of the rendered page.
import './ai-programs.css'
import '@/app/styles/site-components.css'
import '@/app/styles/utilities.css'

export { default, metadata } from '@/entities/site/routes/ai-programs/layout'
