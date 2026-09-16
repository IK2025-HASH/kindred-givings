import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  campaignId: z.string().uuid(),
  orgId: z.string().uuid(),
});

export const sendEmailCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the campaign belongs to the org and is in draft
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("organization_id", data.orgId)
      .eq("status", "draft")
      .maybeSingle();

    if (campErr || !campaign) throw new Error("Campaign not found or already sent.");

    // Get the org's from-email and name
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, contact_email")
      .eq("id", data.orgId)
      .maybeSingle();

    if (!org) throw new Error("Organisation not found.");

    const fromEmail = org.contact_email || "noreply@givewell.charity";
    const fromName = org.name;

    // Build donor query based on audience_filter
    const filter = (campaign.audience_filter as Record<string, unknown>) ?? { all: true };
    let query = supabaseAdmin
      .from("donors")
      .select("id, full_name, email")
      .eq("organization_id", data.orgId)
      .not("email", "is", null)
      .neq("email", "");

    if (filter.gift_aid_only) {
      query = query.eq("gift_aid_declaration", true);
    }

    const { data: donors } = await query;
    const recipients = (donors ?? []).filter((d) => d.email);

    if (!recipients.length) {
      throw new Error("No donors with email addresses match this audience.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Email sending is not configured. Set RESEND_API_KEY.");

    // Build batch email array (Resend allows up to 100 per batch)
    const emails = recipients.map((donor) => ({
      from: `${fromName} <${fromEmail}>`,
      to: [donor.email as string],
      subject: campaign.subject,
      html: campaign.body
        .replace(/{{name}}/g, donor.full_name ?? "Friend")
        .replace(/{{org}}/g, fromName),
      text: campaign.body
        .replace(/<[^>]+>/g, "")
        .replace(/{{name}}/g, donor.full_name ?? "Friend")
        .replace(/{{org}}/g, fromName),
    }));

    // Send in batches of 100
    let totalSent = 0;
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Email send failed: ${err}`);
      }
      totalSent += batch.length;
    }

    // Mark campaign as sent
    await supabaseAdmin
      .from("email_campaigns")
      .update({
        status: "sent",
        recipient_count: totalSent,
        sent_at: new Date().toISOString(),
      })
      .eq("id", data.campaignId);

    return { ok: true as const, sent: totalSent };
  });
