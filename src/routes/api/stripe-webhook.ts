import { createAPIFileRoute } from "@tanstack/react-start/api";
import { STRIPE_API_VERSION } from "@/lib/stripe-config";

export const APIRoute = createAPIFileRoute("/api/stripe-webhook")({
  POST: async ({ request }) => {
    const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!webhookSecret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("No signature", { status: 400 });

    let event: import("stripe").Stripe.Event;
    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"]!, {
        apiVersion: STRIPE_API_VERSION,
      });
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;

      // Donation checkout
      const donationId = session.metadata?.donation_id;
      if (donationId) {
        await supabaseAdmin
          .from("donations")
          .update({ status: "confirmed" })
          .eq("id", donationId);
      }

      // Subscription checkout
      const orgId = session.metadata?.org_id;
      const planId = session.metadata?.plan_id;
      const interval = session.metadata?.interval;
      if (orgId && planId && session.mode === "subscription" && session.subscription) {
        const { default: Stripe } = await import("stripe");
        const stripeClient = new Stripe(process.env["STRIPE_SECRET_KEY"]!, { apiVersion: STRIPE_API_VERSION });
        const sub = await stripeClient.subscriptions.retrieve(session.subscription as string);
        await supabaseAdmin
          .from("subscriptions")
          .upsert({
            organization_id: orgId,
            plan_id: planId,
            billing_period: interval ?? "monthly",
            status: sub.status,
            current_period_end: new Date((sub as import("stripe").Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString(),
            stripe_subscription_id: sub.id,
          } as never, { onConflict: "organization_id" });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as import("stripe").Stripe.Subscription & { current_period_end: number };
      if (sub.id) {
        const status = event.type === "customer.subscription.deleted" ? "cancelled" : sub.status;
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          } as never)
          .eq("stripe_subscription_id" as never, sub.id);
      }
    }

    return new Response("ok", { status: 200 });
  },
});
