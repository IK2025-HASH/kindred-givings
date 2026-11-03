import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { mode: "login" as const } });

    // Check profile exists and is not suspended — covers deleted and banned users
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_suspended")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || profile.is_suspended) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { mode: "login" as const } });
    }

    // Platform admins bypass subscription check — they have no org subscription
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!adminRow) {
      // Check the user's org has an active subscription; if not, gate them to billing.
      // Skip the check when already heading to billing (avoids an infinite redirect loop).
      const isBillingRoute = location.pathname.startsWith("/app/billing");
      if (!isBillingRoute) {
        const { data: member } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", data.user.id)
          .limit(1)
          .maybeSingle();

        if (member?.organization_id) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("org_id", member.organization_id)
            .in("status", ["active", "trialing", "past_due"])
            .limit(1)
            .maybeSingle();

          if (!sub) {
            throw redirect({ to: "/app/billing" });
          }
        }
      }
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
