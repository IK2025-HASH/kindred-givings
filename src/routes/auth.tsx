import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/site/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/format";

const TERMS_VERSION = "2025-09";

type Mode = "login" | "register" | "reset" | "confirm";
type RegisterStep = "plan" | "form";

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  features: string[];
  sort_order: number;
};

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search['mode'] === "register" ? ("register" as const) : ("login" as const),
  }),
  head: () => ({
    meta: [
      { title: "Log in — Donorbook" },
      {
        name: "description",
        content: "Log in to your Donorbook charity workspace or create a new one.",
      },
      { property: "og:title", content: "Log in to Donorbook" },
      { property: "og:description", content: "Access your charity's donation workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [registerStep, setRegisterStep] = useState<RegisterStep>("plan");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  // Reset register sub-step when leaving register mode
  useEffect(() => {
    if (mode !== "register") {
      setRegisterStep("plan");
      setSelectedPlan(null);
    }
  }, [mode]);

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, slug, description, price_monthly, features, sort_order")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      const all = (data ?? []) as Plan[];
      // Keep paid plans + only the first (lowest sort_order) free plan.
      // Filters out "contact us" plans (On Premise etc.) that also have price=0.
      let seenFree = false;
      return all.filter((p) => {
        if (Number(p.price_monthly) > 0) return true;
        if (!seenFree) { seenFree = true; return true; }
        return false;
      });
    },
    enabled: mode === "register" && registerStep === "plan",
  });

  function goToRegister() {
    setMode("register");
    setRegisterStep("plan");
    setSelectedPlan(null);
  }

  function choosePlan(plan: Plan) {
    setSelectedPlan(plan);
    setRegisterStep("form");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").update({
            terms_accepted_at: new Date().toISOString(),
            terms_version: TERMS_VERSION,
          }).eq("id", data.user.id);
        }
        if (data.session) {
          // Email confirmation disabled — go straight to app (or billing if paid plan)
          if (selectedPlan && Number(selectedPlan.price_monthly) > 0) {
            navigate({ to: "/app/billing", search: { subscription: undefined } });
          } else {
            navigate({ to: "/app" });
          }
        } else {
          // Email confirmation required — show holding screen
          setMode("confirm");
        }
      } else if (mode === "login") {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // If this user has no active subscription, send them to billing to pick a plan
        const userId = signInData.user?.id;
        if (userId) {
          const { data: orgs } = await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", userId)
            .limit(1);
          const orgId = orgs?.[0]?.organization_id;
          if (orgId) {
            const { data: sub } = await supabase
              .from("subscriptions")
              .select("id")
              .eq("organization_id", orgId)
              .eq("status", "active")
              .maybeSingle();
            if (!sub) {
              navigate({ to: "/app/billing", search: { subscription: undefined } });
              return;
            }
          }
        }
        navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Password reset link sent.");
        setMode("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy p-10 text-navy-foreground lg:flex">
        <Link to="/">
          <Logo inverted />
        </Link>
        <div>
          <h2 className="font-display text-3xl font-extrabold">
            One home for every donor, gift and appeal
          </h2>
          <p className="mt-4 max-w-md text-navy-foreground/75">
            Create your charity workspace, invite your team and start recording donations today.
          </p>
        </div>
        <p className="text-xs text-navy-foreground/50">© {new Date().getFullYear()} Donorbook</p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        {/* Plan selection step */}
        {mode === "register" && registerStep === "plan" && (
          <div className="w-full max-w-2xl">
            <div className="mb-6 text-center">
              <div className="lg:hidden mb-4">
                <Logo />
              </div>
              <h1 className="font-display text-2xl font-bold">Choose your plan</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Start free, upgrade any time. No card required for the free plan.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {plansLoading && [0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
              {plans?.map((plan, idx) => (
                <button
                  key={plan.id}
                  onClick={() => choosePlan(plan)}
                  className={[
                    "rounded-xl border p-5 text-left transition-all hover:border-primary hover:shadow-lift focus:outline-none focus:ring-2 focus:ring-primary",
                    idx === 1 ? "border-primary shadow-lift ring-1 ring-primary" : "border-border shadow-card",
                  ].join(" ")}
                >
                  <p className="font-display text-base font-semibold">{plan.name}</p>
                  {plan.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{plan.description}</p>
                  )}
                  <p className="mt-3 font-display text-2xl font-extrabold">
                    {Number(plan.price_monthly) === 0
                      ? "Free"
                      : formatMoney(Number(plan.price_monthly))}
                    {Number(plan.price_monthly) > 0 && (
                      <span className="text-sm font-medium text-muted-foreground">/mo</span>
                    )}
                  </p>
                  {Array.isArray(plan.features) && plan.features.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {(plan.features as string[]).slice(0, 3).map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button className="underline text-foreground" onClick={() => setMode("login")}>
                Log in
              </button>
            </p>
          </div>
        )}

        {/* Account creation form step + all other modes */}
        {(mode !== "register" || registerStep === "form") && (
          <Card className="w-full max-w-md shadow-card">
            <CardHeader>
              <div className="lg:hidden">
                <Logo />
              </div>
              <CardTitle className="font-display text-2xl">
                {mode === "register"
                  ? "Create your account"
                  : mode === "reset"
                    ? "Reset your password"
                    : "Welcome back"}
              </CardTitle>
              {mode === "register" && selectedPlan && (
                <p className="text-sm text-muted-foreground">
                  Selected plan:{" "}
                  <span className="font-medium text-foreground">{selectedPlan.name}</span>
                  {Number(selectedPlan.price_monthly) > 0 && (
                    <span> — {formatMoney(Number(selectedPlan.price_monthly))}/mo (pay after registration)</span>
                  )}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {mode === "confirm" && (
                <div className="space-y-4 py-2 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl">✉</div>
                  <div>
                    <p className="font-semibold text-foreground">Check your email</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We sent a confirmation link to <strong>{email}</strong>.
                      Click it to activate your account, then come back to log in.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => setMode("login")}>
                    Back to log in
                  </Button>
                </div>
              )}
              {mode !== "confirm" && (
                <React.Fragment>
                  <form onSubmit={onSubmit} className="space-y-4">
                    {mode === "register" && (
                      <div className="space-y-2">
                        <Label htmlFor="name">Your name</Label>
                        <Input
                          id="name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    {mode !== "reset" && (
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                    {mode === "register" && (
                      <label className="flex items-start gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          required
                        />
                        <span>
                          I have read and agree to the{" "}
                          <Link to="/legal/$doc" params={{ doc: "terms" }} target="_blank" className="underline text-foreground">
                            Terms of Service
                          </Link>
                          ,{" "}
                          <Link to="/legal/$doc" params={{ doc: "privacy" }} target="_blank" className="underline text-foreground">
                            Privacy Policy
                          </Link>
                          , and{" "}
                          <Link to="/legal/$doc" params={{ doc: "data-retention" }} target="_blank" className="underline text-foreground">
                            Data Retention Policy
                          </Link>
                        </span>
                      </label>
                    )}
                    <Button type="submit" className="w-full" disabled={busy || (mode === "register" && !termsAccepted)}>
                      {mode === "register" ? "Create account" : mode === "reset" ? "Send link" : "Log in"}
                    </Button>
                  </form>
                  <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                    {mode === "login" && (
                      <React.Fragment>
                        <button className="underline" onClick={goToRegister}>
                          Need an account? Register
                        </button>
                        <br />
                        <button className="underline" onClick={() => setMode("reset")}>
                          Forgot your password?
                        </button>
                      </React.Fragment>
                    )}
                    {mode === "register" && registerStep === "form" && (
                      <button className="underline" onClick={() => setRegisterStep("plan")}>
                        ← Change plan
                      </button>
                    )}
                    {mode !== "login" && mode !== "register" && (
                      <button className="underline" onClick={() => setMode("login")}>
                        Back to log in
                      </button>
                    )}
                  </div>
                </React.Fragment>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
