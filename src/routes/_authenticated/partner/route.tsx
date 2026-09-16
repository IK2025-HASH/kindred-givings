import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Building2, Palette, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/partner")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: membership } = await supabase
      .from("partner_members")
      .select("partner_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) throw redirect({ to: "/app" });
  },
  component: PartnerShell,
});

const NAV = [
  { to: "/partner", label: "Overview", icon: Building2, exact: true },
  { to: "/partner/clients", label: "Client charities", icon: Users },
  { to: "/partner/branding", label: "White-label", icon: Palette },
] as const;

function PartnerShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b border-border px-5">
          <span className="font-display text-sm font-bold text-primary">Partner Portal</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = item.to === "/partner"
              ? pathname === "/partner" || pathname === "/partner/"
              : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border p-4">
          <Link to="/app" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to charity workspace
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
