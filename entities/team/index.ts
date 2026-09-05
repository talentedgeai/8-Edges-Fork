// The team entity's front door — the /team workspace: coaching, the client
// hub, time off, onboarding, performance reviews, hiring panels, equipment and
// the team assistant route (docs/engineering/2026-09-03-multi-entity-design.md,
// ME-11).
//
// Everything another entity or app/ is allowed to reach lives behind this file;
// the boundary zones in .eslintrc.entities.json enforce that. What company-os
// and portal consume today — the coaching roster and
// ladder, the leave vocabulary, the onboarding cycle, the review engine, the
// contractor emails and the hub panels — resolves through this file only; the
// old `@/lib/...` and `@/components/...` shims went with ME-13.
//
// This is a server-only barrel: the modules below build the service-role
// Supabase client at load. A client component may take a *type* from it; the
// handful that need a value (the admin time-off board, the portal decision
// queue, the hub bands) import the client door, `@/entities/team/client`.
//
// Route bodies (routes/, api/, crons/) are deliberately absent: app/ imports
// those files directly, because Next reads a route's segment config from the
// route file and a page is not a library export.

// AR modules (design §2): each is reached only through its own index.
export * from "./modules/coaching";
export * from "./modules/hub";
export * from "./modules/onboarding";
export * from "./modules/time-off";

// Entity-wide domain: the member's own data and scope, boards, hiring panels,
// interview kits, equipment, the sign-in link, performance reviews and their
// scheduler, role families and the contractor emails.
export * from "./lib/boards";
export * from "./lib/data";
export * from "./lib/equipment";
export * from "./lib/family-screen";
export * from "./lib/hiring";
export * from "./lib/interview-kit";
export * from "./lib/move-card";
export * from "./lib/review-scheduler";
export * from "./lib/review-summary";
export * from "./lib/reviews";
export * from "./lib/reviews-labels";
export * from "./lib/reviews/transcript";
export * from "./lib/role-families";
export * from "./lib/signin-link";

// UI. These carry "use client"; see the caveat above.
export * from "./ui/AvatarUpload";
export * from "./ui/DeviceArt";
export * from "./ui/DirectoryTable";
export * from "./ui/GalleryBrowser";
export * from "./ui/IdUpload";
export * from "./ui/OnboardingWalkthrough";
export * from "./ui/ReviewHistoryTable";
export * from "./ui/StartHerePanel";
export * from "./ui/TeamChatWidget";
export * from "./ui/TeamCollage";
export * from "./ui/TeamSidebar";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";
