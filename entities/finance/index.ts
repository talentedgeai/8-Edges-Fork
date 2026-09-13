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
// The client-hub invoices panel and its row shape; finance owns invoices (R.2).
export * from "./ui/InvoicesPanel";
export type { HubInvoice } from "./lib/hub-invoice";
