"use server";

import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/integrations/supabase/server";

const generateSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

const revokeSchema = z.object({
  keyId: z.string().uuid(),
  orgId: z.string().uuid(),
});

export const generateApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data }) => {
    const { orgId, name } = data;

    // Verify caller is an org owner or admin
    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("Unauthorised");

    const { data: member } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      throw new Error("Only org owners and admins can create API keys");
    }

    // Generate a cryptographically secure key
    const rawKey = "gw_" + randomBytes(24).toString("hex");
    const keyPrefix = rawKey.slice(0, 10) + "…";
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const { data: newKey, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        organization_id: orgId,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        created_by: user.id,
      })
      .select("id, name, key_prefix, created_at")
      .single();

    if (error) throw error;

    return {
      ...newKey,
      rawKey, // returned ONCE only — never stored in plaintext
    };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => revokeSchema.parse(data))
  .handler(async ({ data }) => {
    const { keyId, orgId } = data;

    const { data: { user } } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("Unauthorised");

    const { data: member } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      throw new Error("Only org owners and admins can revoke API keys");
    }

    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", keyId)
      .eq("organization_id", orgId);

    if (error) throw error;
    return { ok: true };
  });
