import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { MarketingShell } from "@/components/site/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Givewell donation management" },
      {
        name: "description",
        content:
          "Simple monthly plans for charities of every size, with limits on team members, donors and campaigns.",
      },
      { property: "og:title", content: "Givewell pricing" },
      {
        property: "og:description",
        content: "Simple monthly plans for charities of every size.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h1 className="font-display text-4xl font-extrabold">Plans that grow with your charity</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Every plan includes donor records, campaigns, a public giving page and reporting. Card
          payments for donations are coming soon.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-80 w-full rounded-xl" />)}
          {data?.map((plan, index) => (
            <Card
              key={plan.id}
              className={
                index === 1 ? "border-primary shadow-lift ring-1 ring-primary" : "shadow-card"
              }
            >
              <CardHeader>
                <CardTitle className="font-display text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-4 font-display text-4xl font-extrabold">
                  {Number(plan.price_monthly) === 0
                    ? "Free"
                    : formatMoney(Number(plan.price_monthly))}
                  {Number(plan.price_monthly) > 0 && (
                    <span className="text-base font-medium text-muted-foreground">/month</span>
                  )}
                </p>
                {Number(plan.price_yearly) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    or {formatMoney(Number(plan.price_yearly))} billed yearly
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" /> Up to {plan.max_members} team members
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" /> {plan.max_donors.toLocaleString()}{" "}
                    donor records
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" /> {plan.max_campaigns} active campaigns
                  </li>
                  {(plan as unknown as Record<string,unknown>).max_qr_boxes !== undefined && (
                    <li className="flex gap-2">
                      <Check className="size-4 text-success" /> {String((plan as unknown as Record<string,unknown>).max_qr_boxes)} QR donation boxes
                    </li>
                  )}
                  {(Array.isArray(plan.features) ? (plan.features as unknown[]) : []).map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="size-4 text-success" /> {String(f)}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-4 w-full" variant={index === 1 ? "default" : "outline"}>
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Choose {plan.name}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
