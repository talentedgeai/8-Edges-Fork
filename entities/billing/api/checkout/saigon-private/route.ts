import { NextResponse } from "next/server";
import { stripe } from "@/entities/billing/stripe";
import { recordRetreatSignup } from "@/entities/company-os";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { sendTelegramMessage } from "@/kernel/messaging/telegram";
import { sendLarkMessage, notifyOps } from "@/kernel/messaging/lark";
import {
  BASE_TEAM_SIZE,
  BASE_PRICE_ENV,
  DAY_PRICE_ENV,
  MAX_DAYS,
  BASE_DAYS,
  calculateTotal,
  dayUnits,
  isValidDays,
} from "@/entities/retreats";
import {
  findOverlappingBlock,
  insertBookingBlock,
} from "@/entities/retreats";
import { recordPrivateSessionBooking } from "@/entities/billing/lib/private-session-booking";
import { escapeHtml } from "@/kernel/config/html";

const EVENT_ID = "saigon-private";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const daysRaw = body.days;
  const days =
    typeof daysRaw === "number"
      ? daysRaw
      : typeof daysRaw === "string"
        ? parseInt(daysRaw, 10)
        : NaN;
  if (!isValidDays(days)) {
    return NextResponse.json(
      { error: `Pick a length: ${BASE_DAYS} to ${MAX_DAYS} days.` },
      { status: 400 },
    );
  }

  const teamSizeRaw = body.team_size;
  const teamSize =
    typeof teamSizeRaw === "number"
      ? teamSizeRaw
      : typeof teamSizeRaw === "string"
        ? parseInt(teamSizeRaw, 10)
        : NaN;
  if (!Number.isFinite(teamSize) || teamSize < BASE_TEAM_SIZE || teamSize > 50) {
    return NextResponse.json(
      { error: `Team size must be at least ${BASE_TEAM_SIZE}.` },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name : null;
  const company = typeof body.company === "string" ? body.company : null;
  const startDate = typeof body.start_date === "string" ? body.start_date.trim() : "";
  const idea = typeof body.idea === "string" ? body.idea : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "A valid start date is required." }, { status: 400 });
  }
  const startDateMs = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(startDateMs)) {
    return NextResponse.json({ error: "A valid start date is required." }, { status: 400 });
  }
  const minMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() + 14,
  );
  if (startDateMs < minMs) {
    return NextResponse.json(
      { error: "Start date must be at least 14 days from today." },
      { status: 400 },
    );
  }

  const endDateMs = startDateMs + (days - 1) * 24 * 60 * 60 * 1000;
  const endDate = new Date(endDateMs).toISOString().slice(0, 10);
  const label = `${days}-day, team of ${teamSize}`;

  const conflict = await findOverlappingBlock(startDate, endDate);
  if (conflict) {
    return NextResponse.json(
      {
        error: `Those dates aren't available (${conflict.start_date} → ${conflict.end_date} is already taken). Please pick a different start date.`,
      },
      { status: 409 },
    );
  }

  const baseEnv = process.env[BASE_PRICE_ENV];
  const dayEnv = process.env[DAY_PRICE_ENV];
  const units = dayUnits(days, teamSize);
  if (!baseEnv) {
    return NextResponse.json(
      { error: `Stripe price not configured. Set ${BASE_PRICE_ENV} on Vercel.` },
      { status: 500 },
    );
  }
  if (units > 0 && !dayEnv) {
    return NextResponse.json(
      { error: `Stripe price not configured. Set ${DAY_PRICE_ENV} on Vercel.` },
      { status: 500 },
    );
  }

  const expectedTotal = calculateTotal(days, teamSize);

  // Step 1: capture the lead in Supabase before any external calls so the
  // record exists even if Stripe or email later fail.
  const messageParts = [
    `Duration: ${days} days`,
    `Team size: ${teamSize}`,
    `Start date: ${startDate} (ends ${endDate})`,
    idea ? `Idea: ${idea}` : null,
    `Expected total: $${expectedTotal.toLocaleString("en-US")} USD`,
  ].filter(Boolean) as string[];

  const signup = await recordRetreatSignup({
    email,
    name,
    company,
    eventId: EVENT_ID,
    tierId: `${days}day`,
    cohortSlug: "saigon-private",
    productTier: `${days}day`,
    goal: idea,
    message: messageParts.join("\n"),
  });
  if (!signup.ok) {
    return NextResponse.json({ error: signup.error }, { status: 500 });
  }

  // Realtime ping to Telegram + Lark for the founder.
  const pingText = [
    `🇻🇳 *Saigon Private Reserve*`,
    `*${name}* — ${label}`,
    `Total: $${expectedTotal.toLocaleString("en-US")} USD`,
    `Dates: ${startDate} → ${endDate}`,
    `${email}${company ? ` · ${company}` : ""}`,
    idea ? `Idea: ${idea}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  void Promise.allSettled([sendTelegramMessage(pingText), sendLarkMessage(pingText), notifyOps(pingText)]);

  // Admin email keeps the longer record.
  const adminEmails = process.env.ADMIN_EMAILS;
  if (adminEmails) {
    const recipients = adminEmails.split(",").map((e) => e.trim()).filter(Boolean);
    void sendTransactionalEmail({
      to: recipients,
      subject: `Saigon Private Reserve clicked: ${label}`,
      html: `
        <p>A Saigon private retreat reservation was started on edge8.ai.</p>
        <ul>
          <li><strong>Duration:</strong> ${days} days</li>
          <li><strong>Team size:</strong> ${teamSize}</li>
          <li><strong>Total:</strong> $${expectedTotal.toLocaleString("en-US")} USD</li>
          <li><strong>Name:</strong> ${escapeHtml(name)}</li>
          <li><strong>Email:</strong> ${escapeHtml(email)}</li>
          <li><strong>Company:</strong> ${escapeHtml(company ?? "")}</li>
          <li><strong>Dates:</strong> ${escapeHtml(startDate)} → ${escapeHtml(endDate)}</li>
          <li><strong>Idea:</strong> ${escapeHtml(idea ?? "")}</li>
        </ul>
        <p>Whether they complete payment will be tracked separately via Stripe webhook (when configured).</p>
      `,
    });
  }

  // Step 2: build the checkout line items. Base SKU ($7,000) is qty 1; the
  // $1,000 day-unit SKU is qty (extra days + additional people × days),
  // omitted when it's a 3-day solo booking.
  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: baseEnv, quantity: 1 },
  ];
  if (units > 0 && dayEnv) {
    lineItems.push({ price: dayEnv, quantity: units });
  }

  let checkoutUrl: string | null = null;
  let stripeSessionId: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&event=${EVENT_ID}`,
      cancel_url: `${origin}/saigon-private#reserve`,
      customer_email: email,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      metadata: {
        event_id: EVENT_ID,
        tier_id: `${days}day`,
        days: String(days),
        team_size: String(teamSize),
        start_date: startDate,
        end_date: endDate,
        person_id: signup.personId,
        inquiry_id: signup.inquiryId,
        source_site: "edge8.ai",
      },
    });
    checkoutUrl = session.url;
    stripeSessionId = session.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    console.error(`[checkout/saigon-private]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!checkoutUrl) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
  }

  // Reserve the dates immediately. We block on Stripe-session-created (not on
  // payment-completed) because the alternative is racing two buyers on the
  // same dates while the first is still typing their card. If the buyer
  // abandons, the block can be removed manually from /admin/blocks.
  const blockResult = await insertBookingBlock({
    startDate,
    endDate,
    inquiryId: signup.inquiryId,
    notes: `${label} · ${name} <${email}>`,
  });
  if (!blockResult.ok) {
    console.error("[checkout/saigon-private] block insert failed:", blockResult.error);
  }

  // Mirror the reservation into company_os (order + booking). Best-effort: the
  // lead (people + inquiries) is already saved via recordRetreatSignup above.
  await recordPrivateSessionBooking({
    personId: signup.personId,
    inquiryId: signup.inquiryId,
    startDate,
    endDate,
    teamSize,
    amountCents: expectedTotal * 100,
    stripeSessionId,
    idea,
    days,
  });

  return NextResponse.json({
    ok: true,
    url: checkoutUrl,
    personId: signup.personId,
    inquiryId: signup.inquiryId,
  });
}

