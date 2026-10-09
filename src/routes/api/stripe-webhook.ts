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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;
      const donationId = session.metadata?.donation_id;
      if (donationId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("donations")
          .update({ status: "confirmed" })
          .eq("id", donationId);
      }
    }

    return new Response("ok", { status: 200 });
  },
});
