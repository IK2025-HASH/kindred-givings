import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  slug: z.string().min(1).max(64),
  amount: z.number().positive().max(1_000_000),
  campaignId: z.string().uuid().nullable().optional(),
  name: z.string().max(120).optional(),
  email: z.string().email().max(160).optional(),
  message: z.string().max(500).optional(),
  giftAid: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  recurring: z.boolean().optional(),
  sourceLocation: z.string().max(120).optional(),
});

export const submitPublicDonation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, currency, contact_email, public_page_enabled, status")
      .eq("slug", data.slug)
      .maybeSingle();

    if (orgError) throw new Error("Could not reach the charity right now.");
    if (!org || !org.public_page_enabled || org.status !== "active") {
      throw new Error("This giving page is not accepting donations.");
    }

    let campaignId: string | null = null;
    if (data.campaignId) {
      const { data: campaign } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("id", data.campaignId)
        .eq("organization_id", org.id)
        .maybeSingle();
      campaignId = campaign?.id ?? null;
    }

    const { error } = await supabaseAdmin.from("donations").insert({
      organization_id: org.id,
      campaign_id: campaignId,
      amount: data.amount,
      currency: org.currency,
      method: "online",
      status: "pending",
      source: "public_page",
      is_recurring: !!data.recurring,
      gift_aid: !!data.giftAid,
      is_anonymous: !!data.anonymous,
      donor_name: data.anonymous ? null : (data.name ?? null),
      donor_email: data.email ?? null,
      message: data.message ?? null,
      source_location: data.sourceLocation ?? null,
    });

    if (error) throw new Error("We could not record your donation. Please try again.");

    // Send donor receipt email — fails gracefully (donation already recorded above)
    if (data.email && !data.anonymous) {
      void sendDonorReceipt({
        to: data.email,
        donorName: data.name ?? "Supporter",
        orgName: org.name,
        orgEmail: org.contact_email ?? undefined,
        amount: data.amount,
        currency: org.currency,
      });
    }

    return { ok: true as const };
  });

async function sendDonorReceipt({
  to,
  donorName,
  orgName,
  orgEmail,
  amount,
  currency,
}: {
  to: string;
  donorName: string;
  orgName: string;
  orgEmail?: string;
  amount: number;
  currency: string;
}) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return; // not configured — skip silently

  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);

  const html = `
    <p>Dear ${donorName},</p>
    <p>Thank you for your gift of <strong>${formatted}</strong> to <strong>${orgName}</strong>.</p>
    <p>Your pledge has been recorded. ${orgName} will be in touch to confirm receipt.</p>
    <p style="color:#6b7280;font-size:13px;">
      If you have questions, reply to this email or contact ${orgName} directly.
    </p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${orgName} via Givewell <noreply@givewell.app>`,
      reply_to: orgEmail,
      to: [to],
      subject: `Thank you for your gift to ${orgName}`,
      html,
    }),
  }).catch(() => {/* swallow — donation is already saved */});
}
