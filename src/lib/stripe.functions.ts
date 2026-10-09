import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/stripe-config";

function appOrigin() {
  const url = process.env["VITE_APP_URL"];
  if (!url) throw new Error("VITE_APP_URL is not set — Stripe redirects cannot be built.");
  return url;
}

async function getStripe() {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe is not configured on this server.");
  const { default: Stripe } = await import("stripe");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

// ── 1. Create/resume Stripe Connect Express onboarding link ──────────────────
export const createConnectOnboardingLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = await getStripe();

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, stripe_account_id")
      .eq("id", data.orgId)
      .single();

    if (!org) throw new Error("Organisation not found.");

    let accountId = org.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { name: org.name },
      });
      accountId = account.id;
      await supabaseAdmin
        .from("organizations")
        .update({ stripe_account_id: accountId })
        .eq("id", org.id);
    }

    const origin = appOrigin();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/app/settings?stripe=refresh`,
      return_url: `${origin}/app/settings?stripe=connected`,
      type: "account_onboarding",
    });

    return { url: link.url };
  });

// ── 2. Verify onboarding is complete and sync DB ─────────────────────────────
export const checkStripeOnboarding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("id", data.orgId)
      .single();

    if (!org?.stripe_account_id) return { complete: false };

    const stripe = await getStripe();
    const account = await stripe.accounts.retrieve(org.stripe_account_id);
    const complete = !!(account.details_submitted && account.charges_enabled);

    if (complete && !org.stripe_onboarding_complete) {
      await supabaseAdmin
        .from("organizations")
        .update({ stripe_onboarding_complete: true })
        .eq("id", data.orgId);
    }

    return { complete };
  });

// ── 3. Create Stripe Checkout session for a donor ────────────────────────────
export const createDonationCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      slug: z.string().min(1).max(64),
      amount: z.number().positive().max(1_000_000),
      campaignId: z.string().uuid().nullable().optional(),
      donorName: z.string().max(120).optional(),
      donorEmail: z.string().email().max(160).optional(),
      message: z.string().max(500).optional(),
      giftAid: z.boolean().optional(),
      anonymous: z.boolean().optional(),
      recurring: z.boolean().optional(),
      sourceLocation: z.string().max(120).optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select(
        "id, name, currency, stripe_account_id, stripe_onboarding_complete, public_page_enabled, status, contact_email"
      )
      .eq("slug", data.slug)
      .maybeSingle();

    if (!org || !org.public_page_enabled || org.status !== "active") {
      throw new Error("This giving page is not accepting donations.");
    }
    if (!org.stripe_account_id || !org.stripe_onboarding_complete) {
      throw new Error("Card payments are not set up for this charity yet.");
    }

    // Record the donation as pending before creating the checkout
    const { data: donation, error: donErr } = await supabaseAdmin
      .from("donations")
      .insert({
        organization_id: org.id,
        campaign_id: data.campaignId ?? null,
        amount: data.amount,
        currency: org.currency,
        method: "stripe",
        status: "pending",
        source: "public_page",
        is_recurring: !!data.recurring,
        gift_aid: !!data.giftAid,
        is_anonymous: !!data.anonymous,
        donor_name: data.anonymous ? null : (data.donorName ?? null),
        donor_email: data.donorEmail ?? null,
        message: data.message ?? null,
        source_location: data.sourceLocation ?? null,
      })
      .select("id")
      .single();

    if (donErr || !donation) throw new Error("Could not initialise payment.");

    const stripe = await getStripe();
    const origin = appOrigin();
    const currency = org.currency.toLowerCase();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: `Donation to ${org.name}` },
            unit_amount: Math.round(data.amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: data.donorEmail ?? undefined,
      success_url: `${origin}/give/${data.slug}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/give/${data.slug}`,
      metadata: {
        donation_id: donation.id,
        org_id: org.id,
      },
      payment_intent_data: {
        transfer_data: { destination: org.stripe_account_id },
        application_fee_amount: 0,
      },
    });

    return { url: session.url! };
  });
