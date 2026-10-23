import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createSubscriptionCheckout } from "@/lib/stripe.functions";

export const Route = createFileRoute("/_authenticated/app/billing")({
  validateSearch: (s: Record<string, unknown>) => ({
    subscription: s.subscription as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Billing — Donorbook" },
      { name: "description", content: "Manage your Donorbook subscription." },
    ],
  }),
  component: BillingPage,
});

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
};

type Subscription = {
  id: string;
  plan_id: string;
  status: string;
  billing_period: string;
  current_period_end: string | null;
};

function BillingPage() {
  const { currentOrg } = useAuth();
  const { subscription: successParam } = useSearch({ from: "/_authenticated/app/billing" });
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (successParam === "success") {
      toast.success("Subscription activated — thank you!");
    }
  }, [successParam]);

  const plansQuery = useQuery({
    queryKey: ["public-plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features as string[] : [],
        stripe_price_id_monthly: (p as never as Plan).stripe_price_id_monthly ?? null,
        stripe_price_id_yearly: (p as never as Plan).stripe_price_id_yearly ?? null,
      }));
    },
  });

  const subQuery = useQuery({
    queryKey: ["org-subscription", currentOrg?.id],
    enabled: !!currentOrg?.id,
    queryFn: async (): Promise<Subscription | null> => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, plan_id, status, billing_period, current_period_end")
        .eq("organization_id", currentOrg!.id)
        .maybeSingle();
      return data as Subscription | null;
    },
  });

  const currentSub = subQuery.data;
  const plans = plansQuery.data ?? [];

  async function subscribe(plan: Plan) {
    if (!currentOrg) return;
    const priceId = interval === "yearly" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    if (!priceId) {
      toast.error("This plan is not yet available for online subscription. Please contact support.");
      return;
    }
    setBusy(plan.id);
    try {
      const { url } = await createSubscriptionCheckout({
        data: { orgId: currentOrg.id, planId: plan.id, interval },
      });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setBusy(null);
    }
  }

  const activePlanId = currentSub?.status === "active" ? currentSub.plan_id : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Billing & plan"
        subtitle="Manage your Donorbook subscription"
      />

      {currentSub && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <CreditCard className="size-5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                Current plan:{" "}
                <span className="font-semibold">
                  {plans.find((p) => p.id === currentSub.plan_id)?.name ?? "—"}
                </span>
                <Badge
                  variant={currentSub.status === "active" ? "default" : "secondary"}
                  className="ml-2 text-xs capitalize"
                >
                  {currentSub.status}
                </Badge>
              </p>
              {currentSub.current_period_end && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Renews {new Date(currentSub.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant={interval === "monthly" ? "default" : "outline"}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </Button>
        <Button
          size="sm"
          variant={interval === "yearly" ? "default" : "outline"}
          onClick={() => setInterval("yearly")}
        >
          Yearly <Badge variant="secondary" className="ml-1.5 text-xs">Save ~17%</Badge>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = activePlanId === plan.id;
          const price = interval === "yearly" ? plan.price_yearly : plan.price_monthly;
          const hasStripe = interval === "yearly" ? !!plan.stripe_price_id_yearly : !!plan.stripe_price_id_monthly;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary ring-1 ring-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge className="shrink-0">Current</Badge>}
                </div>
                {plan.description && (
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-3xl font-bold">£{price}</span>
                  <span className="text-sm text-muted-foreground">/{interval === "yearly" ? "yr" : "mo"}</span>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {price === 0 ? (
                  <Button variant="outline" className="w-full" disabled>
                    {isCurrent ? "Active (free)" : "Free plan"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={isCurrent || busy === plan.id || !hasStripe}
                    onClick={() => void subscribe(plan)}
                  >
                    {busy === plan.id ? (
                      "Redirecting…"
                    ) : isCurrent ? (
                      "Active"
                    ) : !hasStripe ? (
                      "Coming soon"
                    ) : (
                      <><Zap className="mr-1.5 size-4" />Subscribe</>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Payments are processed securely by Stripe. Cancel any time from your Stripe billing portal.
      </p>
    </div>
  );
}
