import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useCampaigns, useDonations, useDonors } from "@/hooks/useOrgData";
import { downloadCsv, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Givewell workspace" },
      {
        name: "description",
        content: "Filter giving by date, compare campaigns and methods, and export the numbers.",
      },
      { property: "og:title", content: "Fundraising reports in Givewell" },
      { property: "og:description", content: "Giving by campaign, method and top donors." },
    ],
  }),
  component: ReportsPage,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function ReportsPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const currency = currentOrg?.currency ?? "GBP";
  const donations = useDonations(orgId);
  const donors = useDonors(orgId);
  const campaigns = useCampaigns(orgId);

  const today = new Date();
  const [from, setFrom] = useState(
    new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const rows = useMemo(
    () =>
      (donations.data ?? []).filter(
        (d) => d.status === "confirmed" && d.donated_on >= from && d.donated_on <= to,
      ),
    [donations.data, from, to],
  );

  const total = rows.reduce((s, d) => s + d.amount, 0);
  const byCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of rows) {
      const name = campaigns.data?.find((c) => c.id === d.campaign_id)?.title ?? "General fund";
      map.set(name, (map.get(name) ?? 0) + d.amount);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows, campaigns.data]);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of rows) map.set(d.method, (map.get(d.method) ?? 0) + d.amount);
    return [...map.entries()].map(([name, value]) => ({ name: name.replace("_", " "), value }));
  }, [rows]);

  const topDonors = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of rows) {
      const name = d.is_anonymous
        ? "Anonymous"
        : (donors.data?.find((x) => x.id === d.donor_id)?.full_name ?? d.donor_name ?? "Supporter");
      map.set(name, (map.get(name) ?? 0) + d.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rows, donors.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Giving performance for any date range."
        action={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                `report-${from}-to-${to}.csv`,
                rows.map((d) => ({
                  date: d.donated_on,
                  amount: d.amount,
                  method: d.method,
                  campaign:
                    campaigns.data?.find((c) => c.id === d.campaign_id)?.title ?? "General fund",
                  gift_aid: d.gift_aid,
                  recurring: d.is_recurring,
                })),
              )
            }
          >
            Export range
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total raised</p>
            <p className="mt-2 font-display text-2xl font-bold">{formatMoney(total, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Gifts</p>
            <p className="mt-2 font-display text-2xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average gift</p>
            <p className="mt-2 font-display text-2xl font-bold">
              {formatMoney(rows.length ? total / rows.length : 0, currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By campaign</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCampaign} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} />
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By method</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Pie data={byMethod} dataKey="value" nameKey="name" outerRadius={100} label>
                  {byMethod.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top donors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topDonors.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <span>{d.name}</span>
              <span className="font-semibold">{formatMoney(d.value, currency)}</span>
            </div>
          ))}
          {topDonors.length === 0 && (
            <p className="text-sm text-muted-foreground">No giving in this range.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
