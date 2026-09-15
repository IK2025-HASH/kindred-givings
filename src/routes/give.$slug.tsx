import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { submitPublicDonation } from "@/lib/public-donations.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/give/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Donate — ${params.slug.replace(/-/g, " ")} on Givewell` },
      {
        name: "description",
        content: "Support this charity with a one-off or regular gift through its Givewell page.",
      },
      { property: "og:title", content: "Support this charity" },
      {
        property: "og:description",
        content: "Give a one-off or regular donation and follow campaign progress.",
      },
    ],
  }),
  component: GivePage,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
      This giving page could not be loaded.
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
      We couldn't find that charity.
    </div>
  ),
});

function GivePage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const [amount, setAmount] = useState<number | "">("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [giftAid, setGiftAid] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const orgQuery = useQuery({
    queryKey: ["public-org", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("slug", slug)
        .eq("public_page_enabled", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const org = orgQuery.data;

  const campaignsQuery = useQuery({
    queryKey: ["public-campaigns", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("organization_id", org!.id)
        .eq("status", "active")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const statsQuery = useQuery({
    queryKey: ["public-stats", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_org_stats", { _slug: slug });
      if (error) throw error;
      return data?.[0] ?? { total_raised: 0, supporters: 0 };
    },
  });

  const supportersQuery = useQuery({
    queryKey: ["public-supporters", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_recent_supporters", { _slug: slug });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error("Please choose an amount");
      return;
    }
    setBusy(true);
    try {
      await submitPublicDonation({
        data: {
          slug,
          amount: Number(amount),
          campaignId,
          name: name || undefined,
          email: email || undefined,
          message: message || undefined,
          giftAid,
          anonymous,
          recurring,
        },
      });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't record that donation");
    } finally {
      setBusy(false);
    }
  }

  if (orgQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!org) return null;

  const suggested = org.suggested_amounts ?? [10, 25, 50, 100];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-10">
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt={`${org.name} logo`}
              className="size-14 rounded-lg bg-card object-contain p-1"
            />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HeartHandshake className="size-7" />
            </span>
          )}
          <div>
            <h1 className="font-display text-3xl font-extrabold">{org.name}</h1>
            {org.tagline && <p className="text-navy-foreground/75">{org.tagline}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          {org.story && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Our story</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line text-muted-foreground">
                {org.story}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Impact so far</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total raised</p>
                <p className="font-display text-2xl font-bold">
                  {formatMoney(Number(statsQuery.data?.total_raised ?? 0), org.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Supporters</p>
                <p className="font-display text-2xl font-bold">
                  {Number(statsQuery.data?.supporters ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>

          {(campaignsQuery.data?.length ?? 0) > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Current appeals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaignsQuery.data?.map((c) => (
                  <div key={c.id}>
                    <div className="flex justify-between text-sm font-medium">
                      <span>{c.title}</span>
                      {c.target_amount && (
                        <span className="text-muted-foreground">
                          target {formatMoney(Number(c.target_amount), org.currency)}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                    )}
                    <Progress className="mt-2" value={campaignId === c.id ? 100 : 35} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Recent supporters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(supportersQuery.data ?? []).length === 0 && (
                <p className="text-muted-foreground">Be the first to give.</p>
              )}
              {(supportersQuery.data ?? []).map((s, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{s.display_name}</p>
                    {s.message && <p className="text-muted-foreground">{s.message}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatMoney(Number(s.amount), org.currency)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(s.donated_on)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit shadow-lift lg:sticky lg:top-8">
          {done ? (
            <CardContent className="space-y-3 py-12 text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" />
              <h2 className="font-display text-2xl font-bold">Thank you</h2>
              <p className="text-muted-foreground">
                Your pledge has been sent to {org.name}. They will confirm it shortly and be in
                touch about payment.
              </p>
              <Button variant="outline" onClick={() => setDone(false)}>
                Make another gift
              </Button>
              {user ? (
                <p className="text-sm text-muted-foreground">
                  <Link to="/my-giving" className="underline underline-offset-2">
                    View your giving history
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className="underline underline-offset-2"
                  >
                    Create a free account
                  </Link>{" "}
                  to track your giving history across all charities.
                </p>
              )}
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="font-display text-2xl">Make a donation</CardTitle>
                {(org as Record<string, unknown>).payment_link_url && (
                  <a
                    href={String((org as Record<string, unknown>).payment_link_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Pay by card
                  </a>
                )}
                <p className="text-sm text-muted-foreground">
                  Fill in the form below and the charity will be in touch to complete your gift.
                </p>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={submit}>
                  <div className="flex flex-wrap gap-2">
                    {suggested.map((a) => (
                      <Button
                        key={a}
                        type="button"
                        variant={amount === a ? "default" : "outline"}
                        onClick={() => setAmount(a)}
                      >
                        {formatMoney(a, org.currency)}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      min={1}
                      step="0.01"
                      value={amount}
                      onChange={(e) =>
                        setAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      required
                    />
                  </div>

                  {(campaignsQuery.data?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <Label>Give to</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={campaignId === null ? "default" : "outline"}
                          onClick={() => setCampaignId(null)}
                        >
                          Where most needed
                        </Button>
                        {campaignsQuery.data?.map((c) => (
                          <Button
                            key={c.id}
                            type="button"
                            size="sm"
                            variant={campaignId === c.id ? "default" : "outline"}
                            onClick={() => setCampaignId(c.id)}
                          >
                            {c.title}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="donor-name">Your name</Label>
                      <Input
                        id="donor-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="donor-email">Email</Label>
                      <Input
                        id="donor-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="donor-message">Message (optional)</Label>
                    <Textarea
                      id="donor-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3 rounded-lg bg-secondary p-4 text-sm">
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={recurring}
                        onCheckedChange={(v) => setRecurring(v === true)}
                      />
                      <span>Make this a regular monthly gift</span>
                    </label>
                    <label className="flex items-start gap-3">
                      <Checkbox checked={giftAid} onCheckedChange={(v) => setGiftAid(v === true)} />
                      <span>
                        Add Gift Aid — I am a UK taxpayer and want {org.name} to reclaim tax on this
                        gift.
                      </span>
                    </label>
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={anonymous}
                        onCheckedChange={(v) => setAnonymous(v === true)}
                      />
                      <span>Keep my gift anonymous on the supporters wall</span>
                    </label>
                  </div>

                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? "Sending…" : "Give now"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
