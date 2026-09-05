// Thin composer: the layout lives in the billing entity (ME-05). The global
// stylesheets stay here because they live under app/, which an entity may not
// import; the import order is the cascade order and must not be reshuffled.
import '@/app/styles/site-components.css'
import '@/app/styles/utilities.css'

export { default } from '@/entities/billing/routes/checkout/layout'
