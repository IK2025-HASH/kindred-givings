import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, TrendingUp, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/partner/")({
  head: () => ({ meta: [{ title: "Partner Dashboard — Givewell" }] }),
  component: PartnerDashboard,
});

type Partner = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  custom_domain: string | null;
  plan: string;
  status: string;
};

type ClientSummary = {
  org_id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  member_count: number;
  donation_total: number;
};

function PartnerDashboard() {
  const partnerQ = useQuery({
    queryKey: ["my-partner"],
    queryFn: async (): Promise<Partner | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("partner_members")
        .select("partners(*)")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.partners as unknown as Partner) ?? null;
    },
  });

  const clientsQ = useQuery({
    queryKey: ["partner-clients", partnerQ.data?.id],
    enabled: !!partnerQ.data?.id,
    queryFn: async (): Promise<ClientSummary[]> => {
      const { data, error } = await supabase
        .from("partner_client_summary")
        .select("*")
        .eq("partner_id", partnerQ.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientSummary[];
    },
  });

  const partner = partnerQ.data;
  const clients = clientsQ.data ?? [];
  const totalRaised = clients.reduce((s, c) => s + c.donation_total, 0);
  const activeClients = clients.filter((c) => c.status === "active").length;

  if (partnerQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!partner) return <p className="text-muted-foreground">Partner account not found.</p>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {partner.logo_url && (
              <img src={partner.logo_url} alt={partner.name} className="size-10 rounded-lg object-contain" />
            )}
            <div>
              <h1 className="font-display text-2xl font-bold">{partner.name}</h1>
              <p className="text-sm text-muted-foreground">
                Partner dashboard · <Badge variant="secondary" className="text-xs">{partner.plan}</Badge>
              </p>
            </div>
          </div>
          {partner.custom_domain && (
            <p className="mt-1 text-xs text-muted-foreground">
              Custom domain: <code className="rounded bg-muted px-1">{partner.custom_domain}</code>
            </p>
          )}
        </div>
        <Button asChild>
          <Link to="/partner/clients">
            Manage clients <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Client charities", value: clients.length.toString(), icon: Building2 },
          { label: "Active clients", value: activeClients.toString(), icon: Users },
          { label: "Total raised (all clients)", value: formatMoney(totalRaised, "GBP"), icon: Wallet },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-display text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent client charities</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/partner/clients">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Building2 className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No clients yet</p>
              <p className="text-xs text-muted-foreground">Add your first client charity from the Clients tab.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {clients.slice(0, 5).map((c) => (
                <div key={c.org_id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      /give/{c.slug} · {c.member_count} team member{c.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatMoney(c.donation_total, "GBP")}</p>
                    <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="py-5">
            <TrendingUp className="size-6 text-primary" />
            <p className="mt-3 font-semibold">White-label branding</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set your logo, colours and custom domain so your clients see your brand, not ours.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/partner/branding">Configure branding</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="py-5">
            <Building2 className="size-6 text-primary" />
            <p className="mt-3 font-semibold">Add a client charity</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a workspace for a new client in seconds — no sign-up required from them.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/partner/clients">Add client</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
