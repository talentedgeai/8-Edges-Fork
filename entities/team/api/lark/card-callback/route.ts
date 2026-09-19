import { NextResponse } from "next/server";

import { companyOs } from "@/kernel/data/supabase";
import { larkEmailByOpenId } from "@/kernel/messaging/lark-api";
import { cardHandlerFor } from "@/kernel/messaging/lark-card";
import {
  readCardTap,
  readLarkHeaders,
  urlVerificationChallenge,
  verifyLarkCallback,
} from "@/kernel/messaging/lark-callback";

// Inbound Lark card taps -> the handler the owning entity registered.
//
// Register this in the Lark developer console, under the app's event & callback
// configuration, as:
//   https://<your-domain>/api/lark/card-callback/
// The TRAILING SLASH is required: next.config sets trailingSlash: true, so the
// slashless URL answers 308 and Lark does not follow redirects — every tap
// would be dropped silently, the failure mode the Resend webhook hit.
//
// The route lives in the team entity rather than the kernel because a kernel
// package cannot own an app route, and the team entity is where a tapping
// person is resolved to a team member. It is deliberately ignorant of what a
// card means: the kind on the button selects a handler another entity
// registered (kernel/messaging/lark-card.ts).

const LOG = "[lark/card-callback]";

type Resolved = { teamMemberId: string; personId: string; email: string };

/**
 * Resolve the tapping Lark user to an active team member. Lark only tells us
 * an open_id, and the only identity our tables share with Lark is the email
 * address — `people.lark_email` when the Lark account differs from the work
 * address, `people.email` otherwise.
 */
async function resolveTeamMember(openId: string): Promise<Resolved | null> {
  const email = await larkEmailByOpenId(openId);
  if (!email) {
    console.warn(`${LOG} no email for open_id ${openId}`);
    return null;
  }
  const normalised = email.trim().toLowerCase();

  const { data: person, error: personError } = await companyOs
    .from("people")
    .select("id, email")
    .or(`email.eq.${normalised},lark_email.eq.${normalised}`)
    .limit(1)
    .maybeSingle();
  if (personError) {
    console.error(`${LOG} people lookup failed:`, personError.message);
    return null;
  }
  if (!person) {
    console.warn(`${LOG} no person for ${normalised}`);
    return null;
  }

  const { data: member, error: memberError } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", person.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (memberError) {
    console.error(`${LOG} team_members lookup failed:`, memberError.message);
    return null;
  }
  if (!member) {
    console.warn(`${LOG} no active team member for ${normalised}`);
    return null;
  }

  return { teamMemberId: member.id, personId: person.id, email: person.email };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verdict = verifyLarkCallback(rawBody, readLarkHeaders(request.headers));
  if (!verdict.ok) {
    // 503 when nothing is configured, 401 when something is and did not check
    // out. Either way the payload is never acted on: an unverified tap could
    // write another person's commitments.
    console.error(`${LOG} rejected: ${verdict.reason}`);
    return NextResponse.json({ error: verdict.reason }, { status: verdict.status });
  }

  const challenge = urlVerificationChallenge(verdict.payload);
  if (challenge) return NextResponse.json({ challenge });

  const tap = readCardTap(verdict.payload);
  if (!tap) return NextResponse.json({});

  // A toast rather than an error status for a tap we cannot place: Lark shows
  // the body to the person who tapped, and a 4xx shows them nothing but a
  // failure badge. The person is real; the mapping is what is missing.
  if (!tap.openId) {
    return NextResponse.json({ toast: { type: "error", content: "Could not identify you in Lark." } });
  }

  const handler = cardHandlerFor(tap.value.kind);
  if (!handler) {
    console.warn(`${LOG} no handler for kind ${tap.value.kind}`);
    return NextResponse.json({ toast: { type: "error", content: "This card is no longer active." } });
  }

  const resolved = await resolveTeamMember(tap.openId);
  if (!resolved) {
    return NextResponse.json({
      toast: { type: "error", content: "Your Lark account is not linked to a team member." },
    });
  }

  try {
    const response = await handler({ ...resolved, value: tap.value });
    return NextResponse.json(response);
  } catch (err) {
    // Lark retries a non-2xx, so a handler that throws would replay the tap.
    // Log it and answer the person instead.
    console.error(`${LOG} handler ${tap.value.kind} failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ toast: { type: "error", content: "Something went wrong. Try again." } });
  }
}
