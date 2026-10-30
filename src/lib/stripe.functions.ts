import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/stripe-config";

function appOrigin() {
  return (
    process.env["APP_URL"] ??
    process.env["VITE_APP_URL"] ??
    "https://kindred-givings.nl-product-factory.com"
  );
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
    prices: [], // No Stripe price — handled via "Contact us" lead form
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
  .inputValidator((d: unknown) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ results: SyncResult[] }> => {
    // DEBUG_MODE=true in Lovable secrets enables verbose error messages in toasts.
    // Set it to diagnose auth/env issues; remove once resolved for clean production UX.
    const DEBUG = process.env["DEBUG_MODE"] === "true";

    // ── Auth: verify caller is a platform admin via RLS ──────────────────────
    // We build a user-scoped Supabase client using the caller's JWT so that
    // Supabase's RLS on platform_admins enforces admin membership. The custom
    // fetch handles the new sb_publishable_* key format (apikey header, not
    // Bearer) — same pattern as client.ts and client.server.ts.
    // APP_SUPABASE_URL / APP_SUPABASE_ANON_KEY are our independent project's values
    // set as Lovable secrets. They take priority over SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY
    // which Lovable injects pointing at its own managed DB.
    const supabaseUrl = process.env["APP_SUPABASE_URL"] || process.env["SUPABASE_URL"];
    const supabasePubKey = process.env["APP_SUPABASE_ANON_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];

    if (DEBUG) {
      console.log("[syncPlansToStripe] env check", {
        APP_SUPABASE_URL: process.env["APP_SUPABASE_URL"] ? process.env["APP_SUPABASE_URL"].substring(0, 35) + "…" : "MISSING",
        APP_SUPABASE_ANON_KEY: process.env["APP_SUPABASE_ANON_KEY"] ? process.env["APP_SUPABASE_ANON_KEY"].substring(0, 22) + "…" : "MISSING",
        SUPABASE_URL_fallback: process.env["SUPABASE_URL"] ? process.env["SUPABASE_URL"].substring(0, 35) + "…" : "MISSING",
        resolved_url: supabaseUrl ? supabaseUrl.substring(0, 35) + "…" : "MISSING",
        resolved_key: supabasePubKey ? supabasePubKey.substring(0, 22) + "…" : "MISSING",
        STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"] ? "present" : "MISSING",
        token_prefix: data.token.substring(0, 30) + "…",
        token_length: data.token.length,
      });
    }

    if (!supabaseUrl || !supabasePubKey) {
      const missing = [!supabaseUrl && "SUPABASE_URL", !supabasePubKey && "SUPABASE_PUBLISHABLE_KEY"].filter(Boolean).join(", ");
      throw new Error(`Server env missing: ${missing}`);
    }

    const { createClient: makeClient } = await import("@supabase/supabase-js");
    const isNewFmtKey = supabasePubKey.startsWith("sb_publishable_") || supabasePubKey.startsWith("sb_secret_");

    // Custom fetch mirrors the pattern in client.ts / client.server.ts:
    // new-format keys go in `apikey` header, NOT as `Authorization: Bearer`.
    const authFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const hdrs = new Headers(init?.headers);
      if (isNewFmtKey && hdrs.get("Authorization") === `Bearer ${supabasePubKey}`) {
        hdrs.delete("Authorization");
      }
      hdrs.set("apikey", supabasePubKey);
      // Ensure the user's JWT is in Authorization (global headers may have set it;
      // the custom fetch should not overwrite it if already present).
      if (!hdrs.has("Authorization")) hdrs.set("Authorization", `Bearer ${data.token}`);
      return fetch(input, { ...init, headers: hdrs });
    };

    const userClient = makeClient(supabaseUrl, supabasePubKey, {
      global: { headers: { Authorization: `Bearer ${data.token}` }, fetch: authFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: adminRow, error: adminErr } = await userClient
      .from("platform_admins")
      .select("user_id")
      .maybeSingle();

    if (DEBUG) {
      console.log("[syncPlansToStripe] RLS check result", {
        adminRow,
        adminErr: adminErr?.message ?? null,
        isNewFmtKey,
      });
    }

    if (!adminRow) {
      throw new Error(
        DEBUG
          ? `Unauthorized — RLS: ${adminErr?.message ?? "no row returned"}. URL=${supabaseUrl.substring(0, 35)}. Key=${supabasePubKey.substring(0, 22)}. Token[0:30]=${data.token.substring(0, 30)}`
          : "Unauthorized"
      );
    }

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
  .inputValidator((d: unknown) => z.object({ token: z.string(), orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireOrgRoleToken(data.token, data.orgId, ["owner", "admin"]);
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
  .inputValidator((d: unknown) => z.object({ token: z.string(), orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireOrgRoleToken(data.token, data.orgId, ["owner", "admin"]);
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
      token: z.string(),
      orgId: z.string().uuid(),
      planId: z.string().uuid(),
      interval: z.enum(["monthly", "yearly"]),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    // Auth via explicit token (Supabase session is in localStorage, not cookies,
    // so it cannot be read from the request headers in getWebRequest()).
    const supabaseUrl = process.env["APP_SUPABASE_URL"] || process.env["SUPABASE_URL"];
    const supabasePubKey = process.env["APP_SUPABASE_ANON_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
    console.log("[checkout] env: url=", supabaseUrl?.substring(0, 45), "key=", supabasePubKey?.substring(0, 22), "svcKey=", process.env["SUPABASE_SERVICE_ROLE_KEY"] ? "present" : "MISSING");
    if (!supabaseUrl || !supabasePubKey) throw new Error("Server configuration error.");
    const { createClient: makeClient } = await import("@supabase/supabase-js");
    const isNewFmt = supabasePubKey.startsWith("sb_publishable_") || supabasePubKey.startsWith("sb_secret_");
    const authFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const hdrs = new Headers(init?.headers);
      if (isNewFmt && hdrs.get("Authorization") === `Bearer ${supabasePubKey}`) hdrs.delete("Authorization");
      hdrs.set("apikey", supabasePubKey);
      if (!hdrs.has("Authorization")) hdrs.set("Authorization", `Bearer ${data.token}`);
      return fetch(input, { ...init, headers: hdrs });
    };
    const userClient = makeClient(supabaseUrl, supabasePubKey, {
      global: { headers: { Authorization: `Bearer ${data.token}` }, fetch: authFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: getUserErr } = await userClient.auth.getUser(data.token);
    if (!user) throw new Error(`Unauthorized (getUser: ${getUserErr?.message ?? "null user"})`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error: memberErr } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    console.log("[checkout] user.id=", user.id, "orgId=", data.orgId, "member=", member, "memberErr=", memberErr?.message);
    if (!member) throw new Error(`You are not a member of this organisation. [uid=${user.id} org=${data.orgId} err=${memberErr?.message ?? "null"}]`);
    if (!["owner", "admin"].includes(member.role)) throw new Error("Insufficient permissions.");
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
      success_url: `${origin}/app/billing?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/billing`,
      metadata: { org_id: org.id, plan_id: plan.id, interval: data.interval },
    });

    return { url: session.url! };
  });

// ── 3b. Sync subscription from a completed Stripe Checkout session ────────────
// Called immediately after the user lands on billing?subscription=success&session_id=...
// This is a fallback for when the webhook hasn't fired yet.
export const syncSubscriptionFromCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      token: z.string().min(1),
      orgId: z.string().uuid(),
      sessionId: z.string().min(1),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(data.token);
    if (authError || !user) throw new Error("Unauthorized");

    const { data: member } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("organization_id", data.orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) throw new Error("Not a member of this organization");

    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);

    if (session.mode !== "subscription" || !session.subscription) return { synced: false };

    const orgId = session.metadata?.['org_id'];
    const planId = session.metadata?.['plan_id'];
    const interval = session.metadata?.['interval'];
    if (!orgId || !planId || orgId !== data.orgId) return { synced: false };

    const sub = await stripe.subscriptions.retrieve(session.subscription as string);
    const stripeSub = sub as import("stripe").Stripe.Subscription & {
      current_period_start: number;
      current_period_end: number;
    };

    await supabaseAdmin
      .from("subscriptions")
      .upsert({
        organization_id: orgId,
        plan_id: planId,
        billing_period: interval ?? "monthly",
        status: sub.status,
        stripe_subscription_id: sub.id,
        current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
      } as never, { onConflict: "organization_id" });

    return { synced: true };
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

// Helper: build a user-scoped Supabase client + verify platform admin via RLS
async function requireAdminToken(token: string) {
  const supabaseUrl = process.env["APP_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const supabasePubKey = process.env["APP_SUPABASE_ANON_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !supabasePubKey) throw new Error("Server configuration error.");
  const { createClient: makeClient } = await import("@supabase/supabase-js");
  const isNewFmt = supabasePubKey.startsWith("sb_publishable_") || supabasePubKey.startsWith("sb_secret_");
  const authFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const hdrs = new Headers(init?.headers);
    if (isNewFmt && hdrs.get("Authorization") === `Bearer ${supabasePubKey}`) hdrs.delete("Authorization");
    hdrs.set("apikey", supabasePubKey);
    if (!hdrs.has("Authorization")) hdrs.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers: hdrs });
  };
  const userClient = makeClient(supabaseUrl, supabasePubKey, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: authFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow } = await userClient.from("platform_admins").select("user_id").maybeSingle();
  if (!adminRow) throw new Error("Unauthorized");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Helper: verify a user's org role using explicit token (mirrors requireAdminToken pattern)
async function requireOrgRoleToken(
  token: string,
  orgId: string,
  roles: ("owner" | "admin" | "fundraiser" | "viewer")[],
) {
  const supabaseUrl = process.env["APP_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const supabasePubKey = process.env["APP_SUPABASE_ANON_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !supabasePubKey) throw new Error("Server configuration error.");
  const { createClient: makeClient } = await import("@supabase/supabase-js");
  const isNewFmt = supabasePubKey.startsWith("sb_publishable_") || supabasePubKey.startsWith("sb_secret_");
  const authFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const hdrs = new Headers(init?.headers);
    if (isNewFmt && hdrs.get("Authorization") === `Bearer ${supabasePubKey}`) hdrs.delete("Authorization");
    hdrs.set("apikey", supabasePubKey);
    if (!hdrs.has("Authorization")) hdrs.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers: hdrs });
  };
  const userClient = makeClient(supabaseUrl, supabasePubKey, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: authFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await userClient.auth.getUser(token);
  if (!user) throw new Error("Unauthorized");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: member } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) throw new Error("You are not a member of this organisation.");
  if (!roles.includes(member.role as never)) throw new Error("Insufficient permissions.");
  return { supabaseAdmin, user };
}

export type AdminSubscription = {
  id: string;
  org_id: string;
  org_name: string;
  plan_name: string;
  status: string;
  billing_period: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  stripe_status: string | null;
  stripe_amount: number | null;
  stripe_currency: string | null;
  stripe_latest_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  mismatch: boolean;
};

// ── 5. Admin: list all subscriptions reconciled against Stripe ──────────────
export const getAdminSubscriptions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ subscriptions: AdminSubscription[] }> => {
    const supabaseAdmin = await requireAdminToken(data.token);
    const stripe = await getStripe();

    const { data: rows, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id, organization_id, plan_id, status, billing_period, current_period_start, current_period_end, stripe_subscription_id, created_at, organizations(name), plans(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const results: AdminSubscription[] = await Promise.all(
      (rows ?? []).map(async (row) => {
        const orgName = (row.organizations as { name: string } | null)?.name ?? "—";
        const planName = (row.plans as { name: string } | null)?.name ?? "—";
        let stripeStatus: string | null = null;
        let stripeAmount: number | null = null;
        let stripeCurrency: string | null = null;
        let stripeLatestInvoiceId: string | null = null;
        let stripePaymentIntentId: string | null = null;

        if (row.stripe_subscription_id) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
              expand: ["latest_invoice.payment_intent"],
            });
            stripeStatus = stripeSub.status;
            const inv = stripeSub.latest_invoice as import("stripe").Stripe.Invoice | null;
            if (inv && typeof inv === "object") {
              stripeLatestInvoiceId = inv.id ?? null;
              stripeAmount = typeof inv.amount_paid === "number" ? inv.amount_paid : null;
              stripeCurrency = inv.currency ?? null;
              const pi = inv.payment_intent as import("stripe").Stripe.PaymentIntent | string | null;
              if (pi && typeof pi === "object") stripePaymentIntentId = pi.id;
              else if (typeof pi === "string") stripePaymentIntentId = pi;
            }
          } catch {
            stripeStatus = "fetch_error";
          }
        }

        const dbActive = ["active", "trialing"].includes(row.status);
        const stripeActive = stripeStatus ? ["active", "trialing"].includes(stripeStatus) : null;
        const mismatch = stripeActive !== null && dbActive !== stripeActive;

        return {
          id: row.id,
          org_id: row.organization_id,
          org_name: orgName,
          plan_name: planName,
          status: row.status,
          billing_period: (row as { billing_period?: string | null }).billing_period ?? null,
          current_period_start: (row as { current_period_start?: string | null }).current_period_start ?? null,
          current_period_end: (row as { current_period_end?: string | null }).current_period_end ?? null,
          stripe_subscription_id: row.stripe_subscription_id ?? null,
          created_at: row.created_at,
          stripe_status: stripeStatus,
          stripe_amount: stripeAmount,
          stripe_currency: stripeCurrency,
          stripe_latest_invoice_id: stripeLatestInvoiceId,
          stripe_payment_intent_id: stripePaymentIntentId,
          mismatch,
        };
      })
    );

    return { subscriptions: results };
  });

// ── 6. Admin: process a refund on a subscription's latest payment ────────────
export const processAdminRefund = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      token: z.string(),
      paymentIntentId: z.string().min(1),
      amountPence: z.number().int().positive(),
      reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]),
    }).parse(d)
  )
  .handler(async ({ data }): Promise<{ refundId: string; status: string; amountPence: number }> => {
    await requireAdminToken(data.token);
    const stripe = await getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: data.paymentIntentId,
      amount: data.amountPence,
      reason: data.reason,
    });
    return { refundId: refund.id, status: refund.status ?? "unknown", amountPence: refund.amount };
  });
