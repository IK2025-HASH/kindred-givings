import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  Check,
  CreditCard,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  QrCode,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { APP_VERSION, APP_VERSION_DATE } from "@/lib/version";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/donors", label: "Donors", icon: Users },
  { to: "/app/donations", label: "Donations", icon: Wallet },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/qr", label: "QR Boxes", icon: QrCode },
  { to: "/app/team", label: "Team", icon: Building2 },
  { to: "/app/inbox", label: "Inbox", icon: Inbox },
  { to: "/app/billing", label: "Billing", icon: CreditCard },
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

function ContactSupportButton({ onNavigate }: { onNavigate?: () => void }) {
  const { user, currentOrg } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;
    setBusy(true);
    try {
      const { data: conv, error: convErr } = await supabase
        .from("support_conversations")
        .insert({
          org_id: currentOrg?.id ?? null,
          started_by: user.id,
          subject: subject.trim(),
          status: "open",
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const { error: msgErr } = await supabase.from("support_messages").insert({
        conversation_id: conv.id,
        sender_id: user.id,
        sender_name: profile?.full_name ?? profile?.email ?? user.email ?? null,
        body: message.trim(),
      });
      if (msgErr) throw msgErr;
      toast.success("Support request sent");
      setSubject("");
      setMessage("");
      setOpen(false);
      onNavigate?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          <LifeBuoy className="size-3.5" />
          Contact support
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact support</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cs-subject">Subject</Label>
            <Input
              id="cs-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-message">Message</Label>
            <Textarea
              id="cs-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue in detail…"
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !subject.trim() || !message.trim()}>
              {busy ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { memberships, currentOrg, setCurrentOrgId, isPlatformAdmin, isChatSupportAgent } = useAuth();
  const settings = usePlatformSettings();
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground">
      <div>
        <Link to="/app" onClick={onNavigate} className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <HeartHandshake className="size-4" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">{settings.app_name}</span>
        </Link>
        <p className="mt-0.5 pl-10 text-[10px] text-sidebar-foreground/40">
          {APP_VERSION} · {APP_VERSION_DATE}
        </p>
      </div>

      {currentOrg ? (
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
      ) : (
        <Link
          to="/app"
          onClick={onNavigate}
          className="block rounded-md border border-dashed border-sidebar-border px-3 py-2 text-left text-sm text-sidebar-foreground/60 hover:border-sidebar-foreground/30 hover:text-sidebar-foreground transition-colors"
        >
          + Set up your charity
        </Link>
      )}

      <NavLinks {...(onNavigate !== undefined ? { onNavigate } : {})} />

      {isChatSupportAgent && !isPlatformAdmin && (
        <Link
          to="/app/support"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
        >
          <MessageCircle className="size-3.5" />
          Support inbox
        </Link>
      )}

      {isPlatformAdmin && (
        <div className="flex flex-col gap-1.5">
          <Link
            to="/app/admin"
            onClick={onNavigate}
            className="rounded-md border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          >
            Platform admin
          </Link>
          <Link
            to="/app/support"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          >
            <MessageCircle className="size-3.5" />
            Support inbox
          </Link>
        </div>
      )}

      <ContactSupportButton {...(onNavigate !== undefined ? { onNavigate } : {})} />

      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2">
        <Link
          to="/legal/$doc"
          params={{ doc: "terms" }}
          onClick={onNavigate}
          className="text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
        >
          Terms
        </Link>
        <Link
          to="/legal/$doc"
          params={{ doc: "privacy" }}
          onClick={onNavigate}
          className="text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
        >
          Privacy
        </Link>
        <Link
          to="/legal/$doc"
          params={{ doc: "data-retention" }}
          onClick={onNavigate}
          className="text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
        >
          Data Retention
        </Link>
      </div>
    </div>
  );
}

function CreateOrg() {
  const { user, refreshMemberships, setCurrentOrgId } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
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
          contact_email: email || user.email || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) {
        const msg = (error as { message?: string })?.message ?? "";
        if (msg.includes("organizations_slug_key")) {
          throw new Error(`The web address "/${finalSlug}" is already taken — try a different one.`);
        }
        throw error;
      }
      const member = await supabase
        .from("organization_members")
        .insert({ organization_id: data.id, user_id: user.id, role: "owner" });
      if (member.error) {
        // Roll back the org so the slug isn't orphaned
        await supabase.from("organizations").delete().eq("id", data.id);
        throw member.error;
      }
      setCurrentOrgId(data.id);
      refreshMemberships();
      toast.success("Charity created");
    } catch (err) {
      console.error("CreateOrg error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? "Could not create charity";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Set up your charity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register your charity to start recording donors and donations.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
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
              {busy ? "Creating…" : "Create charity"}
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

function AutoCreateOrg() {
  const { user, refreshMemberships, setCurrentOrgId } = useAuth();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user || done) return;
    const meta = (user as { user_metadata?: { full_name?: string; charity_name?: string } })?.user_metadata ?? {};
    const baseName = meta.charity_name || (meta.full_name ? `${meta.full_name}'s Charity` : "My Charity");
    const baseSlug = slugify(baseName);

    async function create() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("organizations")
          .insert({
            name: baseName,
            slug: baseSlug,
            contact_email: user.email ?? null,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        const member = await supabase
          .from("organization_members")
          .insert({ organization_id: data.id, user_id: user.id, role: "owner" });
        if (member.error) {
          await supabase.from("organizations").delete().eq("id", data.id);
          throw member.error;
        }
        setCurrentOrgId(data.id);
        refreshMemberships();
        toast.success("Charity ready — rename it any time in Settings");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not create charity";
        if (msg.includes("organizations_slug_key")) {
          // Slug collision — charity may have been created already; refresh
          refreshMemberships();
        } else {
          toast.error(msg);
        }
      } finally {
        setDone(true);
      }
    }

    void create();
  }, [user, done, refreshMemberships, setCurrentOrgId]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Setting up your charity…
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
        Loading your charity…
      </div>
    );
  }

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
            {currentOrg && (
              <span className="truncate text-sm font-semibold lg:hidden">{currentOrg.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentOrg && (
              <a
                href={`/give/${currentOrg.slug}`}
                target="_blank"
                rel="noreferrer"
                className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
              >
                View giving page
              </a>
            )}
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
                    navigate({ to: "/auth", search: { mode: "login" as const }, replace: true });
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
          {!currentOrg ? <AutoCreateOrg /> : children}
        </main>
      </div>
    </div>
  );
}
