import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/server-auth";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send");
    return;
  }
  const { data: settings } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["app_name", "from_email"]);
  const map: Record<string, string> = {};
  for (const r of settings ?? []) map[r.key] = r.value;
  const fromName = map['app_name'] ?? "Donorbook";
  const fromEmail = map['from_email'] ?? "noreply@donorbook.co.uk";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend error:", body);
  }
}

export const sendInviteEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      toEmail: z.string().email(),
      orgName: z.string().max(200),
      inviteLink: z.string().url().max(2000),
      role: z.enum(["owner", "admin", "fundraiser", "viewer"]),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const safeOrgName = escapeHtml(data.orgName);
    const safeRole = escapeHtml(data.role);
    const safeLink = data.inviteLink; // validated as URL by zod; href attribute is safe
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1c1b18">
        <h2 style="margin-bottom:8px">You've been invited to join ${safeOrgName}</h2>
        <p style="color:#6b6860;margin-bottom:24px">
          You have been invited as a <strong>${safeRole}</strong> on Donorbook.
          Click the button below to accept and set up your account.
        </p>
        <a href="${safeLink}"
           style="display:inline-block;background:#1a5276;color:#fff;text-decoration:none;
                  padding:12px 24px;border-radius:6px;font-weight:600">
          Accept invitation
        </a>
        <p style="margin-top:24px;font-size:13px;color:#9e9b93">
          Or copy this link: ${safeLink}
        </p>
        <hr style="border:none;border-top:1px solid #e2e0db;margin:28px 0">
        <p style="font-size:12px;color:#9e9b93">
          If you didn't expect this, you can safely ignore it.
          This link expires in 7 days.
        </p>
      </div>
    `;
    await sendEmail(data.toEmail, `You've been invited to join ${safeOrgName} on Donorbook`, html);
  });

export const sendDonationNotification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      orgEmail: z.string().email(),
      orgName: z.string().max(200),
      donorName: z.string().max(200).nullable(),
      amount: z.number().positive().max(1_000_000),
      currency: z.string().max(3),
      giftAid: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: data.currency }).format(data.amount);
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1c1b18">
        <h2 style="margin-bottom:8px">New donation received 🎉</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:8px 0;color:#6b6860;font-size:14px">Donor</td>
              <td style="padding:8px 0;font-weight:600">${data.donorName ?? "Anonymous"}</td></tr>
          <tr><td style="padding:8px 0;color:#6b6860;font-size:14px">Amount</td>
              <td style="padding:8px 0;font-weight:600">${fmt}</td></tr>
          <tr><td style="padding:8px 0;color:#6b6860;font-size:14px">Gift Aid</td>
              <td style="padding:8px 0;font-weight:600">${data.giftAid ? "Yes — 25% claimable" : "No"}</td></tr>
        </table>
        <p style="font-size:13px;color:#6b6860">
          Log in to Donorbook to view and manage this donation.
        </p>
      </div>
    `;
    await sendEmail(data.orgEmail, `New donation: ${fmt} from ${data.donorName ?? "Anonymous"}`, html);
  });
