"use server";

import { requirePortalMember } from "@/lib/portal-auth";
import { companyOs } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import { getSiteOrigin } from "@/lib/site-origin";
import { MAX_PACKS, PACK_PRICE_CENTS, PACK_TOKENS } from "@/lib/portal/tokens";

// Starts a Stripe Checkout for 1-4 human-token packs (events-flow pattern:
// pending token_purchases + orders rows first, then the session, then stamp
// the session id; the webhook is the payment truth). Admin Assume mode must
// never buy on a client's behalf.

const CHECKOUT_EXPIRY_MINUTES = 30;

export async function purchaseTokenPacks(
  packs: number,
): Promise<{ ok: true; checkoutUrl: string } | { ok: false; error: string }> {
  const actor = await requirePortalMember();
  if (actor.impersonation) return { ok: false, error: "Purchases are disabled while viewing as a client." };

  const n = Math.round(Number(packs));
  if (!Number.isFinite(n) || n < 1 || n > MAX_PACKS)
    return { ok: false, error: `Choose between 1 and ${MAX_PACKS} packs.` };
  const companyId = actor.companyScope[0];
  if (!companyId) return { ok: false, error: "Your portal access isn't linked to a company yet." };

  const amountCents = n * PACK_PRICE_CENTS;
  const tokens = n * PACK_TOKENS;

  const { data: purchase, error: purchaseErr } = await companyOs
    .from("token_purchases")
    .insert({
      company_id: companyId,
      person_id: actor.personId,
      packs: n,
      tokens,
      amount_cents: amountCents,
      currency: "usd",
      status: "pending",
    })
    .select("id")
    .single();
  if (purchaseErr || !purchase) {
    console.error("[tokens] purchase insert failed:", purchaseErr?.message);
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }

  const { data: order, error: orderErr } = await companyOs
    .from("orders")
    .insert({
      person_id: actor.personId,
      payment_method: "stripe",
      amount_cents: amountCents,
      currency: "usd",
      status: "pending",
      metadata: { type: "token_pack", token_purchase_id: purchase.id, company_id: companyId, packs: n },
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    console.error("[tokens] order insert failed:", orderErr?.message);
    await companyOs.from("token_purchases").update({ status: "expired" }).eq("id", purchase.id);
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }

  await companyOs.from("token_purchases").update({ order_id: order.id }).eq("id", purchase.id);

  const origin = getSiteOrigin();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: n,
          price_data: {
            currency: "usd",
            unit_amount: PACK_PRICE_CENTS,
            product_data: {
              name: `Edge8 human-token pack (${PACK_TOKENS} tokens)`,
              description: "1 token = 1 hour of skilled work",
            },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
      customer_email: actor.email,
      billing_address_collection: "required",
      // The tokens page renders pending → paid honestly, so it doubles as the
      // success page (worst case it says "processing" until the webhook lands).
      success_url: `${origin}/portal/tokens?status=success`,
      cancel_url: `${origin}/portal/tokens`,
      metadata: {
        type: "token_pack",
        token_purchase_id: purchase.id,
        order_id: order.id,
        company_id: companyId,
        person_id: actor.personId,
        packs: String(n),
        source_site: "edge8.ai",
      },
    });

    if (!session.url) throw new Error("no checkout url");
    await companyOs.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    await companyOs.from("token_purchases").update({ stripe_session_id: session.id }).eq("id", purchase.id);
    return { ok: true, checkoutUrl: session.url };
  } catch (err) {
    console.error("[tokens] stripe session create failed:", err instanceof Error ? err.message : err);
    await companyOs.from("token_purchases").update({ status: "expired" }).eq("id", purchase.id).eq("status", "pending");
    await companyOs.from("orders").update({ status: "expired" }).eq("id", order.id).eq("status", "pending");
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }
}
