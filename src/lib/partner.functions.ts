import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createClientSchema = z.object({
  partnerId: z.string().uuid(),
  orgName: z.string().min(2),
  orgSlug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  contactEmail: z.string().email().optional(),
  currency: z.string().length(3).default("GBP"),
});

export const createClientOrg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createClientSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller is a member of this partner
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("Not authenticated.");

    const { data: membership } = await supabaseAdmin
      .from("partner_members")
      .select("role")
      .eq("partner_id", data.partnerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) throw new Error("You are not a member of this partner account.");

    // Check slug not taken
    const { data: existing } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", data.orgSlug)
      .maybeSingle();

    if (existing) throw new Error("That URL slug is already taken. Choose another.");

    // Create the org linked to this partner
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.orgName,
        slug: data.orgSlug,
        currency: data.currency,
        contact_email: data.contactEmail ?? null,
        partner_id: data.partnerId,
        status: "active",
        public_page_enabled: true,
        suggested_amounts: [10, 25, 50, 100],
      } as never)
      .select("id, name, slug")
      .single();

    if (error) throw new Error(error.message);

    // Add the creating partner member as owner of the new org
    await supabaseAdmin.from("organization_members").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
    } as never);

    return { ok: true as const, org };
  });

const updateBrandingSchema = z.object({
  partnerId: z.string().uuid(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour like #3B82F6"),
  customDomain: z.string().optional().or(z.literal("")),
});

export const updatePartnerBranding = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateBrandingSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("Not authenticated.");

    const { data: membership } = await supabaseAdmin
      .from("partner_members")
      .select("role")
      .eq("partner_id", data.partnerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || membership.role !== "owner")
      throw new Error("Only partner owners can update branding.");

    const { error } = await supabaseAdmin
      .from("partners")
      .update({
        logo_url: data.logoUrl || null,
        primary_color: data.primaryColor,
        custom_domain: data.customDomain || null,
      } as never)
      .eq("id", data.partnerId);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
