/**
 * notify-donation edge function
 *
 * Triggered by a Supabase Database Webhook on INSERT to the `donations` table
 * where source = 'public_page'.
 *
 * Setup in Supabase dashboard:
 *   Database → Webhooks → Create webhook
 *   Table: donations  |  Events: INSERT
 *   URL: https://<project-ref>.supabase.co/functions/v1/notify-donation
 *
 * Required secrets (set via `supabase secrets set`):
 *   RESEND_API_KEY   — from resend.com (free tier covers 100 emails/day)
 *   FROM_EMAIL       — verified sender address, e.g. noreply@yourdomain.com
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@givewell.app";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const donation = payload.record as {
      id: string;
      organization_id: string;
      amount: number;
      currency: string;
      donor_name: string | null;
      donor_email: string | null;
      message: string | null;
      gift_aid: boolean;
      is_recurring: boolean;
      source: string;
    };

    // Only handle public page donations
    if (donation.source !== "public_page") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch org and its admin emails
    const { data: org } = await admin
      .from("organizations")
      .select("name, currency, contact_email")
      .eq("id", donation.organization_id)
      .maybeSingle();

    if (!org?.contact_email) {
      return new Response(JSON.stringify({ skipped: "no contact email" }), { status: 200 });
    }

    const currency = org.currency ?? "GBP";
    const amount = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(donation.amount));

    const donorLine = donation.donor_name ?? "An anonymous supporter";
    const giftAidLine = donation.gift_aid ? " (Gift Aid eligible)" : "";
    const recurringLine = donation.is_recurring ? " — recurring gift" : "";
    const messageLine = donation.message ? `\n\nTheir message: "${donation.message}"` : "";

    const emailBody = `
A new donation has been received on your Givewell giving page.

Donor: ${donorLine}
Amount: ${amount}${giftAidLine}${recurringLine}${messageLine}

This donation is pending — please confirm it in your Givewell dashboard:
${SUPABASE_URL.replace(".supabase.co", ".app")}/app/donations

— Givewell
    `.trim();

    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not set — email would have been:", emailBody);
      return new Response(JSON.stringify({ ok: true, sent: false }), { status: 200 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [org.contact_email],
        subject: `New donation: ${amount} from ${donorLine} — ${org.name}`,
        text: emailBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
