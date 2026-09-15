import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  Check,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/donors", label: "Donors", icon: Users },
  { to: "/app/donations", label: "Donations", icon: Wallet },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/team", label: "Team", icon: Building2 },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.to === "/app" ? pathname === "/app" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { memberships, currentOrg, setCurrentOrgId, isPlatformAdmin } = useAuth();
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground">
      <Link to="/app" onClick={onNavigate} className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <HeartHandshake className="size-4" />
        </span>
        <span className="font-display text-lg font-extrabold tracking-tight">Givewell</span>
      </Link>

      {currentOrg && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left">
              <span className="block text-[11px] uppercase tracking-wide text-sidebar-foreground/60">
                Charity
              </span>
              <span className="block truncate text-sm font-semibold">{currentOrg.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Switch charity</DropdownMenuLabel>
            {memberships.map((m) => (
              <DropdownMenuItem
                key={m.organization.id}
                onClick={() => setCurrentOrgId(m.organization.id)}
              >
                <span className="flex-1 truncate">{m.organization.name}</span>
                {m.organization.id === currentOrg.id && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <NavLinks onNavigate={onNavigate} />

      {isPlatformAdmin && (
        <Link
          to="/app/admin"
          onClick={onNavigate}
          className="rounded-md border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/70"
        >
          Platform admin
        </Link>
      )}
    </div>
  );
}

function CreateOrg() {
  const { user, refreshMemberships, setCurrentOrgId } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const finalSlug = slugify(slug || name);
      const { data, error } = await supabase
        .from("organizations")
        .insert({
          name,
          slug: finalSlug,
          contact_email: email || user.email,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const member = await supabase
        .from("organization_members")
        .insert({ organization_id: data.id, user_id: user.id, role: "owner" });
      if (member.error) throw member.error;
      setCurrentOrgId(data.id);
      refreshMemberships();
      toast.success("Charity workspace created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-lg space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Set up your charity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create your workspace to start recording donors and donations.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Charity name</Label>
                <Input
                  id="org-name"
                  value={name}
                  required
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug("");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Web address</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/give/</span>
                  <Input
                    id="org-slug"
                    value={slug || slugify(name)}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-email">Contact email</Label>
                <Input
                  id="org-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Creating…" : "Create workspace"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Not setting up a charity?</p>
          <Link
            to="/my-giving"
            className="mt-1 inline-block text-sm font-medium underline underline-offset-2"
          >
            View my donation history →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, memberships, membershipsLoading, currentOrg, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (membershipsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }

  if (memberships.length === 0 || !currentOrg) return <CreateOrg />;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarBody />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-0 p-0">
                <SidebarBody onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm font-semibold lg:hidden">{currentOrg.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/give/${currentOrg.slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
            >
              View giving page
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {user?.email?.split("@")[0] ?? "Account"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/auth", replace: true });
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
