// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the stylesheets, neither of which Next sees through
// a re-export. Everything else about a mount — its path, and the names Next
// binds it by — comes from the route itself (scripts/gen-app-mounts.mjs).
//
// Keys are paths within this entity. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "api/my-retreat/verify/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "api/vietnam-adventure-info-form/route": {
    segment: { runtime: "nodejs" },
  },
  "routes/admin/(dashboard)/operations/retreats/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/events/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/events/[id]/roster.csv/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/events/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/public-retreats/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/registrations/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/events/[slug]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/events/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/my-retreat/[slug]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/my-retreat/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/my-retreat/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/reserve/layout": {
    styles: ["@/entities/retreats/routes/reserve/reserve.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/reserve/saigon-private/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/saigon-private/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/saigon-private/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/arrival/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/infinite-leverage/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/the-vietnam-experience/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/people/dave/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/people/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/people/quan/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/people/trac/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/place/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/the-week/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/the-vietnam-experience/travel-buddy/opengraph-image": {
    segment: { runtime: "nodejs" },
  },
  "routes/vietnam-adventure-flight-info/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/vietnam-adventure-info-form/layout": {
    styles: ["@/entities/retreats/routes/vietnam-adventure-info-form/vietnam-adventure-info-form.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/vietnam-adventure-info-form/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
