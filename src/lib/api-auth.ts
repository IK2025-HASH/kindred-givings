import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/server";

export type ApiAuthResult = {
  orgId: string;
  keyId: string;
} | null;

export async function validateApiKey(request: Request): Promise<ApiAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith("gw_")) return null;

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, organization_id")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  // Update last_used_at asynchronously — don't await to keep latency low
  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { orgId: data.organization_id, keyId: data.id };
}

export function apiResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

export function apiError(message: string, status = 400) {
  return apiResponse({ error: message }, status);
}
