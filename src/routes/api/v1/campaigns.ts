import { createAPIFileRoute } from "@tanstack/start/api";
import { supabaseAdmin } from "@/integrations/supabase/server";
import { validateApiKey, apiResponse, apiError } from "@/lib/api-auth";

export const APIRoute = createAPIFileRoute("/api/v1/campaigns")({
  OPTIONS: async () => {
    return apiResponse(null, 204);
  },

  GET: async ({ request }) => {
    const auth = await validateApiKey(request);
    if (!auth) return apiError("Invalid or missing API key", 401);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const { data, error, count } = await supabaseAdmin
      .from("campaigns")
      .select(
        "id, name, description, goal_amount, currency, status, start_date, end_date, created_at",
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
});
