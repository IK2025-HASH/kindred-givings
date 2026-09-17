import { createAPIFileRoute } from "@tanstack/start/api";
import { supabaseAdmin } from "@/integrations/supabase/server";
import { validateApiKey, apiResponse, apiError } from "@/lib/api-auth";

export const APIRoute = createAPIFileRoute("/api/v1/donors")({
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
      .from("donors")
      .select(
        "id, first_name, last_name, email, phone, gift_aid_declaration, created_at",
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

    const { first_name, last_name, email, phone, gift_aid_declaration } = body;
    if (!first_name || !last_name) {
      return apiError("first_name and last_name are required");
    }

    const { data, error } = await supabaseAdmin
      .from("donors")
      .insert({
        organization_id: auth.orgId,
        first_name: String(first_name),
        last_name: String(last_name),
        email: email ? String(email) : null,
        phone: phone ? String(phone) : null,
        gift_aid_declaration: Boolean(gift_aid_declaration ?? false),
      })
      .select("id, first_name, last_name, email, phone, gift_aid_declaration, created_at")
      .single();

    if (error) return apiError(error.message, 500);

    return apiResponse({ data }, 201);
  },
});
