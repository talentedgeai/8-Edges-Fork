# Spike: Cross-brand (AI Officer) audience

**Date:** 2026-08-22
**Phase:** 5a of the marketing system dev plan
**Question:** An AI Officer campaign must reach AIO's audience, not Edge8's. Federate (read AIO's separate DB at send time) or replicate (copy AIO contacts into company_os)?

## Findings

- **AIO contacts live in a separate Supabase project** ("AI Officer CRM", `ysysmdxjxlkfwzhbwydx`): `public.people`, 40 rows, all with email. Columns: `id, email, name, phone, company, role, source_site, ok_to_contact, auth_user_id`.
- Consent model differs: AIO has a single `ok_to_contact` boolean; Edge8 has `marketing_consent` (subscribed / unsubscribed / never_asked) plus `do_not_contact`, `is_team_member`, persona gates, and `email_events`-based hard-bounce/complaint suppression.
- **The bug that existed:** `resolveAudience` ignored brand entirely, so a campaign tagged "AI Officer" would have mailed the **entire 185-person Edge8 house list**. This is the "wrong list" risk the plan flagged.

## Decision

**Do the safe half now; defer the CRM-merge decision to Dave.**

Merging two customer databases (replicate) or wiring a cross-project service-key client into the send path (federate) are both real, mostly-irreversible decisions with security and data-governance weight. Neither should be made silently by an agent.

What Phase 5b ships instead is the piece that is unambiguously correct either way: **brand-scoped audience resolution** via a `brand_contacts` membership table.
- Edge8 is the "home" brand: its (and brand-less) campaigns draw the whole house list, exactly as before. No regression.
- Any other brand is a **guest**, scoped strictly to its `brand_contacts` membership. Empty membership resolves to **nobody**, never the house list (proven by SQL: 0 members → 0 recipients; 1 member → 1; home → 185).

## Deferred to Dave (the actual federate-vs-replicate call)

Populating AIO's audience. Two options, his choice:
1. **Replicate (one-off or scheduled):** upsert the 40 AIO `people` into `company_os.people` (or just into `brand_contacts` if they should stay logically separate), mapping `ok_to_contact` → `marketing_consent`. Simple, but a snapshot that drifts and mixes the two CRMs' contact records.
2. **Federate:** a read-only client against the AIO project, resolving membership live. Needs `AIO_SUPABASE_URL` + a service key as env vars, and a consent-model translation. No data duplication, but new cross-project secrets.

Until Dave decides, AIO campaigns safely resolve to zero recipients rather than the wrong list.
