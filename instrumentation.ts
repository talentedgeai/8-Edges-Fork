// Next runs this once per server process, before any request. It is where the
// composition root's event subscriptions are registered: a publisher must not
// import the registry (that would put every subscriber back in its import
// graph), so something has to run first, and this is the hook Next gives us.
//
// Two things keep it honest. Next 14 only calls `register()` when
// `experimental.instrumentationHook` is on in next.config.mjs — without it this
// file is dead code and no subscriber ever registers. And Next compiles it once
// per *runtime*: middleware.ts puts an edge runtime in this build, and the
// subscribers reach Supabase (and node:crypto, and resvg) through code the edge
// bundler cannot load. The import therefore sits inside the runtime check as a
// block, not behind an early return: webpack drops a statically-false `if`
// body at parse time, so the edge bundle never sees `@/app/events`, whereas an
// early `return` leaves the import reachable and the edge build fails on the
// first Node-only module in team's graph.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerEventSubscribers } = await import("@/app/events");
    registerEventSubscribers();

    // One line naming everything this build needs and did not get. It reports
    // rather than throws: a half-configured deployment should still serve the
    // pages that do not need the missing variable, and the operator should not
    // have to hit the one route that fails to find out (ADR 0001 — a client
    // hosts this themselves).
    const { missingDeploymentEnv } = await import("@/app/env");
    const missing = missingDeploymentEnv();
    if (missing.length > 0) {
      console.error(`[boot] required environment not set: ${missing.join(", ")}`);
    }
  }
}
