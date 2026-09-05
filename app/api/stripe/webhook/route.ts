// Thin composer: the handler lives in the billing entity (ME-05). Next.js
// binds the route to this file's exports, so both the HTTP method and the
// route config have to be re-exported by name.
export { POST, dynamic } from "@/entities/billing/api/stripe/webhook/route";
