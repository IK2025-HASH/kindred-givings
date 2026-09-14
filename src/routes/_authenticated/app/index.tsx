import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useCampaigns, useDonations, useDonors } from "@/hooks/useOrgData";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Givewell workspace" },
      {
        name: "description",
        content: "Track money raised, donors, average gift and campaign progress for your charity.",
      },
      { property: "og:title", content: "Givewell charity dashboard" },
      { property: "og:description", content: "Money raised, donors and campaign progress." },
    ],
  }),
  component: Dashboard,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const currency = currentOrg?.currency ?? "GBP";
  const donations = useDonations(orgId);
  const donors = useDonors(orgId);
  const campaigns = useCampaigns(orgId);

  const rows = useMemo(
    () => (donations.data ?? []).filter((d) => d.status === "confirmed"),
    [donations.data],
  );

  const now = new Date();
  const monthTotal = rows
    .filter((d) => {
      const dt = new Date(d.donated_on);
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    })
    .reduce((s, d) => s + d.amount, 0);
  const yearTotal = rows
    .filter((d) => new Date(d.donated_on).getFullYear() === now.getFullYear())
    .reduce((s, d) => s + d.amount, 0);
  const recurring = rows.filter((d) => d.is_recurring).reduce((s, d) => s + d.amount, 0);
  const average = rows.length ? yearTotal / Math.max(1, rows.filter((d) => new Date(d.donated_on).getFullYear() === now.getFullYear()).length) : 0;
  const pending = (donations.data ?? []).filter((d) => d.status === "pending");

  const trend = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const d of rows) {
      const key = d.donated_on.slice(0, 7);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + d.amount);
    }
    return [...buckets.entries()].map(([key, total]) => ({
      month: new Date(`${key}-01`).toLocaleDateString("en-GB", { month: "short" }),
      total,
    }));
  }, [rows]);

  const raisedByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of rows) if (d.campaign_id) map.set(d.campaign_id, (map.get(d.campaign_id) ?? 0) + d.amount);
    return map;
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${currentOrg ? `, ${currentOrg.name}` : ""}`}
        description="A live view of your fundraising."
        action={
          <Button asChild>
            <Link to="/app/donations">Record a donation</Link>
          </Button>
        }
      />

      {pending.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              {pending.length} donation{pending.length > 1 ? "s" : ""} from your giving page
              {pending.length > 1 ? " are" : " is"} waiting to be confirmed.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/donations">Review</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Raised this month" value={formatMoney(monthTotal, currency)} />
        <Stat label="Raised this year" value={formatMoney(yearTotal, currency)} />
        <Stat label="Average gift" value={formatMoney(average, currency)} />
        <Stat
          label="Donors"
          value={String(donors.data?.length ?? 0)}
          hint={`${formatMoney(recurring, currency)} recurring`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Giving over the last 12 months</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="give" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
              <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--primary)"
                fill="url(#give)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaign progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(campaigns.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            )}
            {(campaigns.data ?? []).slice(0, 5).map((c) => {
              const raised = raisedByCampaign.get(c.id) ?? 0;
              const target = Number(c.target_amount ?? 0);
              return (
                <div key={c.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-muted-foreground">
                      {formatMoney(raised, currency)}
                      {target > 0 ? ` of ${formatMoney(target, currency)}` : ""}
                    </span>
                  </div>
                  <Progress value={target > 0 ? Math.min(100, (raised / target) * 100) : 0} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest donations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(donations.data ?? []).slice(0, 6).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {d.is_anonymous
                      ? "Anonymous"
                      : (d.donor_name ??
                        donors.data?.find((x) => x.id === d.donor_id)?.full_name ??
                        "Supporter")}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(d.donated_on)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {d.status !== "confirmed" && <Badge variant="secondary">{d.status}</Badge>}
                  <span className="font-semibold">{formatMoney(d.amount, currency)}</span>
                </div>
              </div>
            ))}
            {(donations.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No donations recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
