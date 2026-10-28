/**
 * Server-side auth helpers for TanStack Start server functions.
 * Call requireAuth() / requireOrgRole() at the top of any handler
 * that uses supabaseAdmin — those handlers run as any caller, so
 * they must enforce identity themselves.
 */
import { getWebRequest } from "@tanstack/react-start/server";

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Throw unless the request carries a valid Supabase session token. */
export async function requireAuth() {
  const request = getWebRequest();
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token) throw new Error("Unauthorized");

  const admin = await getAdminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) throw new Error("Unauthorized");

  return { user, admin };
}

/** Throw unless the authenticated user holds one of the given roles in orgId. */
export async function requireOrgRole(
  orgId: string,
  roles: ("owner" | "admin" | "fundraiser" | "viewer")[] = ["owner", "admin", "fundraiser", "viewer"],
) {
  const { user, admin } = await requireAuth();

  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) throw new Error("You are not a member of this organisation.");
  if (!roles.includes(member.role as never)) throw new Error("Insufficient permissions.");

  return { user, admin, role: member.role };
}

/** Throw unless the authenticated user is a platform admin. */
export async function requirePlatformAdmin() {
  const { user, admin } = await requireAuth();

  const { data } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) throw new Error("Platform admin access required.");
  return { user, admin };
}
