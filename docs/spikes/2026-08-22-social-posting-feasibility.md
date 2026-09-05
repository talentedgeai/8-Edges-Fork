# Spike: Social posting feasibility (LinkedIn + Facebook)

**Date:** 2026-08-22
**Phase:** 3 of the marketing system dev plan
**Question:** Can the calendar post to LinkedIn and Facebook programmatically, or should social stay manual-post-with-reminders?

## Findings

**No existing integration.** A sweep of `lib/` and `app/` found zero social posting code and no `*LINKEDIN*` / `*FACEBOOK*` / `*META*` / `*SOCIAL*` env vars. The only social references are `linkedin_url` / profile fields on `people` — contact data, not an API client.

**LinkedIn.** Posting to an organization page needs the Community Management API, which requires a LinkedIn developer app **approved for that program** plus an org admin OAuth token with `w_organization_social`. Approval is a manual review, not a same-day self-serve. None of this exists today.

**Facebook.** Posting to a Page needs a Meta app, a Page access token via the Graph API, and — for a public/production app — Meta App Review for `pages_manage_posts`. Again a review gate, not instant.

## Decision: NO-GO on API posting (for now)

Both platforms gate programmatic posting behind an app-review process we have not started and cannot complete inside this build. Building an API poster now would be speculative code against credentials that don't exist.

**Ship the manual path instead (Phase 4a):**
- Each blog/LinkedIn/Facebook entry gets a "Mark posted" action + a field to paste the live post URL.
- A daily digest cron lists entries **due today (or overdue) and not yet posted**, emailed to the founder and pinged to Lark ops — same pattern as `ideas-digest`.

Email is excluded from the digest: it already sends itself via the campaign engine.

## Revisit criteria (when to reopen the API path — Phase 4b)

Reopen only when **all** hold for a platform:
1. A developer app exists and is approved for the posting program.
2. A long-lived org/page access token is stored as an env var (documented in the repo).
3. There is real posting volume that manual posting can't keep up with.

At that point 4b builds `lib/social/{linkedin,facebook}.ts` behind one `postToChannel(entry)` interface, and the existing `scheduled_at` + `scheduled` status drive a poster cron modeled on `email-campaign-send`.

## Code deleted

None — this spike was investigation only (grep + reading cron patterns). No throwaway code was written.
