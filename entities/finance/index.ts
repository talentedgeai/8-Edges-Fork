// The Finance entity's server door (RS-03, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): invoicing, the
// QuickBooks connection, contractor payments, vendors, FX rates, compensation,
// products and expenses.
//
// Finance is deliberately separate from Billing. Billing is the Stripe-facing
// side of taking money — checkout, orders, webhooks — and a client may want it
// without Edge8's bookkeeping, or the bookkeeping without Stripe. Keeping them
// apart is what makes either answer available.
//
// Its admin screens still live in company-os and move here in a later slice;
// what moved first is ownership of the tables and the modules that write them.
export * from "./lib/reads";
export * from "./lib/writes";
export * from "./lib/invoice-kind";
// What it cost to serve a client, by month: the one door the Revenue hub's
// gross-margin figures read (RF-3). Named exports, not a star: the module's
// INPUT row types carry `person_id` and `team_member_id` as join keys, and a
// star would make those part of finance's public surface. Only the function
// and the shapes a caller has to name cross the door, and none of them has a
// person on it.
export { loadDeliveryCost } from "./lib/delivery-cost";
export type { BilledMix, DeliveryCost } from "./lib/delivery-cost";
// The client-hub invoices panel and its row shape; finance owns invoices (R.2).
export * from "./ui/InvoicesPanel";
export type { HubInvoice } from "./lib/hub-invoice";
