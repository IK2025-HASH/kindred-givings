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
      const donationId = session.metadata?.['donation_id'];
      if (donationId) {
        // Mark donation confirmed
        const { data: donation } = await supabaseAdmin
          .from("donations")
          .update({ status: "confirmed" })
          .eq("id", donationId)
          .select("amount, currency, donor_name, donor_email, gift_aid, is_anonymous, organization_id")
          .single();

        // Send charity notification + donor receipt after confirmed payment
        if (donation) {
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("name, contact_email")
            .eq("id", donation.organization_id)
            .single();

          const resendKey = process.env["RESEND_API_KEY"];
          const fromEmail = process.env["FROM_EMAIL"] ?? "noreply@donorbook.co.uk";
          const appName = process.env["APP_NAME"] ?? "Donorbook";

          if (resendKey && org) {
            const amount = new Intl.NumberFormat("en-GB", {
              style: "currency",
              currency: donation.currency ?? "GBP",
              maximumFractionDigits: 0,
            }).format(Number(donation.amount));
            const donorName = donation.is_anonymous ? "An anonymous supporter" : (donation.donor_name ?? "A supporter");
            const giftAidNote = donation.gift_aid ? " (Gift Aid eligible)" : "";

            // Notify charity
            if (org.contact_email) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
                body: JSON.stringify({
                  from: fromEmail,
                  to: [org.contact_email],
                  subject: `New donation confirmed: ${amount} from ${donorName}`,
                  text: `A card payment has been confirmed on your ${appName} giving page.\n\nDonor: ${donorName}\nAmount: ${amount}${giftAidNote}\n\nView in your dashboard: ${process.env["APP_URL"] ?? "https://donorbook.co.uk"}/app/donations\n\n— ${appName}`,
                }),
              }).catch(() => null);
            }

            // Send donor receipt
            if (!donation.is_anonymous && donation.donor_email) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
                body: JSON.stringify({
                  from: fromEmail,
                  to: [donation.donor_email],
                  subject: `Thank you for your donation to ${org.name}`,
                  text: `Dear ${donation.donor_name ?? "Supporter"},\n\nThank you for your generous donation of ${amount} to ${org.name}.${giftAidNote}\n\nYour payment has been received and confirmed.\n\nWith gratitude,\n${org.name} via ${appName}`,
                }),
              }).catch(() => null);
            }
          }
        }
      }

      // Subscription checkout
      const orgId = session.metadata?.['org_id'];
      const planId = session.metadata?.['plan_id'];
      const interval = session.metadata?.['interval'];
      if (orgId && planId && session.mode === "subscription" && session.subscription) {
        const { default: Stripe } = await import("stripe");
        const stripeClient = new Stripe(process.env["STRIPE_SECRET_KEY"]!, { apiVersion: STRIPE_API_VERSION });
        const sub = await stripeClient.subscriptions.retrieve(session.subscription as string);
        const stripeSub = sub as import("stripe").Stripe.Subscription & { current_period_start: number; current_period_end: number };
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
