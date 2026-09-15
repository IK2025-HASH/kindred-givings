import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-giving")({
  head: () => ({
    meta: [{ title: "My giving — Givewell" }],
  }),
  component: MyGivingPage,
});

type GiftRow = {
  id: string;
  donated_on: string;
  amount: number;
  currency: string;
  status: string;
  gift_aid: boolean;
  is_recurring: boolean;
  message: string | null;
  org_name: string;
  org_slug: string;
  org_currency: string;
};

function MyGivingPage() {
  const { user, memberships, signOut } = useAuth();
  const navigate = useNavigate();

  const historyQuery = useQuery({
    queryKey: ["my-donation-history", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<GiftRow[]> => {
      const { data, error } = await supabase.rpc("my_donation_history");
      if (error) throw error;
      return (data ?? []) as GiftRow[];
    },
  });

  const confirmed = (historyQuery.data ?? []).filter((d) => d.status === "confirmed");
  const total = confirmed.reduce((s, d) => s + Number(d.amount), 0);
  const charityCount = new Set(confirmed.map((d) => d.org_slug)).size;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <HeartHandshake className="size-4" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">Givewell</span>
          </Link>
          <div className="flex items-center gap-3">
            {memberships.length > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/app">Charity dashboard</Link>
              </Button>
            )}
            <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-2xl font-bold">My giving</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All donations you have made through Givewell, matched to {user?.email}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total given
              </p>
              <p className="mt-2 font-display text-2xl font-bold">
                {formatMoney(total, "GBP")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Donations
              </p>
              <p className="mt-2 font-display text-2xl font-bold">{confirmed.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Charities supported
              </p>
              <p className="mt-2 font-display text-2xl font-bold">{charityCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Donation history</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Charity</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Gift Aid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historyQuery.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{formatDate(d.donated_on)}</TableCell>
                    <TableCell className="font-medium">
                      <a href={`/give/${d.org_slug}`} className="hover:underline">
                        {d.org_name}
                      </a>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatMoney(Number(d.amount), d.org_currency || "GBP")}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {d.gift_aid ? <Badge variant="secondary">Gift Aid</Badge> : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.status === "confirmed" ? "default" : "secondary"}>
                        {d.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!historyQuery.isLoading && (historyQuery.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No donations found for {user?.email}.{" "}
                      <Link to="/" className="underline">
                        Discover charities to support
                      </Link>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
