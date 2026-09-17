import { createAPIFileRoute } from "@tanstack/start/api";
import { supabaseAdmin } from "@/integrations/supabase/server";
import { validateApiKey, apiResponse, apiError } from "@/lib/api-auth";

export const APIRoute = createAPIFileRoute("/api/v1/donations")({
  OPTIONS: async () => {
    return apiResponse(null, 204);
  },

  GET: async ({ request }) => {
    const auth = await validateApiKey(request);
    if (!auth) return apiError("Invalid or missing API key", 401);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const { data, error, count } = await supabaseAdmin
      .from("donations")
      .select(
        "id, amount, currency, status, payment_method, gift_aid_claimed, notes, donated_at, created_at, donors(id, first_name, last_name, email)",
        { count: "exact" }
      )
      .eq("organization_id", auth.orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return apiError(error.message, 500);

    return apiResponse({
      data,
      pagination: { total: count ?? 0, limit, offset },
    });
  },

  POST: async ({ request }) => {
    const auth = await validateApiKey(request);
    if (!auth) return apiError("Invalid or missing API key", 401);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return apiError("Request body must be valid JSON");
    }

    const { donor_id, amount, currency, payment_method, notes, donated_at, gift_aid_claimed } = body;

    if (!donor_id || !amount) {
      return apiError("donor_id and amount are required");
    }
    if (Number(amount) <= 0) {
      return apiError("amount must be a positive number");
    }

    // Verify donor belongs to this org
    const { data: donor } = await supabaseAdmin
      .from("donors")
      .select("id")
      .eq("id", String(donor_id))
      .eq("organization_id", auth.orgId)
      .maybeSingle();

    if (!donor) return apiError("Donor not found or does not belong to your organisation", 404);

    const { data, error } = await supabaseAdmin
      .from("donations")
      .insert({
        organization_id: auth.orgId,
        donor_id: String(donor_id),
        amount: Number(amount),
        currency: currency ? String(currency).toUpperCase() : "GBP",
        status: "confirmed",
        payment_method: payment_method ? String(payment_method) : "other",
        gift_aid_claimed: Boolean(gift_aid_claimed ?? false),
        notes: notes ? String(notes) : null,
        donated_at: donated_at ? String(donated_at) : new Date().toISOString(),
      })
      .select("id, amount, currency, status, payment_method, gift_aid_claimed, donated_at, created_at")
      .single();

    if (error) return apiError(error.message, 500);

    return apiResponse({ data }, 201);
  },
});
