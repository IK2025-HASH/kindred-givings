import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/stripe-config";
import { requireOrgRole } from "@/lib/server-auth";

function appOrigin() {
  const url = process.env["APP_URL"];
  if (!url) throw new Error("APP_URL is not set — Stripe redirects cannot be built.");
  return url;
}

async function getStripe() {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe is not configured on this server.");
  const { default: Stripe } = await import("stripe");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

// ── 0. Sync platform plans → Stripe products + prices ───────────────────────
const STRIPE_PLAN_DEFS = [
  {
    slug: "starter",
    name: "Starter",
    description: "Get started free — ideal for small charities",
    statement_descriptor: "DONORBOOK STARTER",
    unit_label: "charity",
    marketing_features: [
      "Up to 100 donor records",
      "Up to 3 active campaigns",
      "Up to 3 team members",
      "Gift Aid tracking",
      "Public giving page",
    ],
    prices: [
      { interval: "month" as const, amount_pence: 0,     nickname: "Starter Monthly",    lookup_key: "starter_monthly"    },
      { interval: "year"  as const, amount_pence: 0,     nickname: "Starter Yearly",     lookup_key: "starter_yearly"     },
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    description: "For growing charities — more donors, campaigns and team members",
    statement_descriptor: "DONORBOOK GROWTH",
    unit_label: "charity",
    marketing_features: [
      "Up to 500 donor records",
      "Up to 10 active campaigns",
      "Up to 5 team members",
      "Gift Aid tracking",
      "Public giving page",
    ],
    prices: [
      { interval: "month" as const, amount_pence: 900,   nickname: "Growth Monthly",     lookup_key: "growth_monthly"     },
      { interval: "year"  as const, amount_pence: 9000,  nickname: "Growth Yearly",      lookup_key: "growth_yearly"      },
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "For large charities — unlimited donors, campaigns and team",
    statement_descriptor: "DONORBOOK ENTERPRISE",
    unit_label: "charity",
    marketing_features: [
      "Unlimited donor records",
      "Unlimited active campaigns",
      "Unlimited team members",
      "Gift Aid tracking",
      "Public giving page",
      "Priority support",
      "Dedicated account manager",
    ],
    prices: [
      { interval: "month" as const, amount_pence: 5900,  nickname: "Enterprise Monthly", lookup_key: "enterprise_monthly" },
      { interval: "year"  as const, amount_pence: 59000, nickname: "Enterprise Yearly",  lookup_key: "enterprise_yearly"  },
    ],
  },
  {
    slug: "on-premise",
    name: "On Premise",
    description: "Self-hosted deployment for organisations with specific compliance requirements",
    statement_descriptor: "DONORBOOK ONPREM",
    unit_label: "licence",
    marketing_features: [
      "Self-hosted on your infrastructure",
      "Custom compliance & data residency",
      "Dedicated SLA & support",
      "Custom integrations & API access",
      "White-label branding",
    ],
    prices: [], // Contact us — no automated price
  },
] as const;

type SyncResult = {
  slug: string;
  name: string;
  product_id: string;
  price_id_monthly: string | null;
  price_id_yearly: string | null;
  skipped: boolean;
};

export const syncPlansToStripe = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ results: SyncResult[] }> => {
    const { requirePlatformAdmin } = await import("@/lib/server-auth");
    await requirePlatformAdmin();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = await getStripe();

    const results: SyncResult[] = [];

    for (const plan of STRIPE_PLAN_DEFS) {
      // Check if any price with this plan's lookup keys already exists
      const existingMonthly = plan.prices.find((p) => p.interval === "month")
        ? (await stripe.prices.list({ lookup_keys: [plan.prices.find((p) => p.interval === "month")!.lookup_key], limit: 1 })).data[0] ?? null
        : null;
      const existingYearly = plan.prices.find((p) => p.interval === "year")
        ? (await stripe.prices.list({ lookup_keys: [plan.prices.find((p) => p.interval === "year")!.lookup_key], limit: 1 })).data[0] ?? null
        : null;

      // If both prices already exist, skip creation
      const allPricesExist =
        plan.prices.length === 0 ||
        (plan.prices.every((p) => p.interval === "month") && !!existingMonthly) ||
        (plan.prices.every((p) => p.interval === "year") && !!existingYearly) ||
        (plan.prices.length === 2 && !!existingMonthly && !!existingYearly);

      let productId: string;
      let priceIdMonthly: string | null = existingMonthly?.id ?? null;
      let priceIdYearly: string | null = existingYearly?.id ?? null;

      if (allPricesExist && plan.prices.length > 0) {
        productId = (existingMonthly ?? existingYearly)!.product as string;
        results.push({ slug: plan.slug, name: plan.name, product_id: productId, price_id_monthly: priceIdMonthly, price_id_yearly: priceIdYearly, skipped: true });
      } else {
        // Create the product
        const product = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          statement_descriptor: plan.statement_descriptor,
          unit_label: plan.unit_label,
          tax_code: "txcd_10000000",
          metadata: { plan_slug: plan.slug, app: "donorbook" },
          marketing_features: plan.marketing_features.map((f) => ({ name: f })),
        });
        productId = product.id;

        // Create any missing prices
        for (const p of plan.prices) {
          const existing = p.interval === "month" ? existingMonthly : existingYearly;
          if (existing) {
            if (p.interval === "month") priceIdMonthly = existing.id;
            else priceIdYearly = existing.id;
            continue;
          }
          const price = await stripe.prices.create({
            product: productId,
            currency: "gbp",
            unit_amount: p.amount_pence,
            recurring: { interval: p.interval, usage_type: "licensed" },
            nickname: p.nickname,
            tax_behavior: "exclusive",
            lookup_key: p.lookup_key,
            transfer_lookup_key: true,
            metadata: {
              billing_period: p.interval === "month" ? "monthly" : "yearly",
              plan_slug: plan.slug,
            },
          });
          if (p.interval === "month") priceIdMonthly = price.id;
          else priceIdYearly = price.id;
        }

        results.push({ slug: plan.slug, name: plan.name, product_id: productId, price_id_monthly: priceIdMonthly, price_id_yearly: priceIdYearly, skipped: false });
      }

      // Write price IDs back to the plans table
      if (priceIdMonthly || priceIdYearly) {
        await supabaseAdmin
          .from("plans")
          .update({
            ...(priceIdMonthly ? { stripe_price_id_monthly: priceIdMonthly } : {}),
            ...(priceIdYearly  ? { stripe_price_id_yearly:  priceIdYearly  } : {}),
          })
          .eq("slug", plan.slug);
      }
    }

    return { results };
  });

// ── 1. Create/resume Stripe Connect Express onboarding link ──────────────────
export const createConnectOnboardingLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireOrgRole(data.orgId, ["owner", "admin"]);
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
    await requireOrgRole(data.orgId, ["owner", "admin"]);
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

// ── 3. Create Stripe Checkout session for a platform subscription ────────────
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      planId: z.string().uuid(),
      interval: z.enum(["monthly", "yearly"]),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    await requireOrgRole(data.orgId, ["owner", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = await getStripe();
    const origin = appOrigin();

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, contact_email, stripe_customer_id")
      .eq("id", data.orgId)
      .single();
    if (!org) throw new Error("Organisation not found.");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("id, name, stripe_price_id_monthly, stripe_price_id_yearly")
      .eq("id", data.planId)
      .single();
    if (!plan) throw new Error("Plan not found.");

    const priceId = data.interval === "yearly" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    if (!priceId) throw new Error(`Stripe Price ID for this plan (${data.interval}) is not configured yet. Contact support.`);

    // Create or reuse Stripe customer for this org
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        ...(org.contact_email ? { email: org.contact_email } : {}),
        metadata: { org_id: org.id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app/billing?subscription=success`,
      cancel_url: `${origin}/app/billing`,
      metadata: { org_id: org.id, plan_id: plan.id, interval: data.interval },
    });

    return { url: session.url! };
  });

// ── 4. Create Stripe Checkout session for a donor ────────────────────────────
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

    // Record the donation as pending before creating the checkout
    const { data: donation, error: donErr } = await supabaseAdmin
      .from("donations")
      .insert({
        organization_id: org.id,
        campaign_id: data.campaignId ?? null,
        amount: data.amount,
        currency: org.currency,
        method: "card",
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

    // Route to charity's own Stripe account if they've completed Connect onboarding,
    // otherwise collect to the platform account and distribute manually.
    const connectedAccount =
      org.stripe_account_id && org.stripe_onboarding_complete
        ? org.stripe_account_id
        : null;

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
      ...(data.donorEmail ? { customer_email: data.donorEmail } : {}),
      success_url: `${origin}/give/${data.slug}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/give/${data.slug}?payment=cancelled`,
      metadata: {
        donation_id: donation.id,
        org_id: org.id,
      },
      ...(connectedAccount
        ? {
            payment_intent_data: {
              transfer_data: { destination: connectedAccount },
              application_fee_amount: 0,
            },
          }
        : {}),
    });

    return { url: session.url! };
  });
