import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Heart, HeartHandshake, MapPin, Share2, Users } from "lucide-react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { submitPublicDonation } from "@/lib/public-donations.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/give/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({
    loc: typeof s["loc"] === "string" ? s["loc"] : undefined,
  }),
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
});

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function isYouTube(url: string) {
  return /youtu\.?be/.test(url);
}

function youtubeEmbed(url: string) {
  const m =
    url.match(/youtube\.com\/watch\?v=([^&]+)/) ??
    url.match(/youtu\.be\/([^?]+)/) ??
    url.match(/youtube\.com\/embed\/([^?]+)/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function GivePage() {
  const { slug } = Route.useParams();
  const { loc } = Route.useSearch();
  const { user } = useAuth();
  const pageUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";

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
      return data ?? null;
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

  // Real per-campaign raised amounts
  const campaignStatsQuery = useQuery({
    queryKey: ["public-campaign-stats", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("donations")
        .select("campaign_id, amount")
        .eq("organization_id", org!.id)
        .in("status", ["confirmed", "pending"]);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const d of data ?? []) {
        if (d.campaign_id) {
          map[d.campaign_id] = (map[d.campaign_id] ?? 0) + Number(d.amount);
        }
      }
      return map;
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
          sourceLocation: loc || undefined,
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
      <div className="mx-auto max-w-5xl space-y-4 p-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (orgQuery.isSuccess && !org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <HeartHandshake className="size-12 text-muted-foreground/50" />
        <h1 className="font-display text-2xl font-bold">We couldn't find that charity</h1>
        <p className="max-w-sm text-muted-foreground">
          The giving page for <span className="font-medium">{slug}</span> doesn't exist or is not
          currently active.
        </p>
        <Link to="/" className="text-sm underline underline-offset-2">
          Go to Givewell home
        </Link>
      </div>
    );
  }

  if (!org) return null;

  const suggested = org.suggested_amounts ?? [10, 25, 50, 100];
  const totalRaised = Number(statsQuery.data?.total_raised ?? 0);
  const supporters = Number(statsQuery.data?.supporters ?? 0);
  const campaigns = campaignsQuery.data ?? [];
  const campaignRaised = campaignStatsQuery.data ?? {};
  const supportersList = supportersQuery.data ?? [];

  // Media: banner_url if set via Settings
  const mediaUrl = org?.banner_url ?? "";
  const hasMedia = mediaUrl.length > 0;
  const embedUrl = hasMedia && isYouTube(mediaUrl) ? youtubeEmbed(mediaUrl) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* ── HERO ── */}
      <div className="bg-navy text-navy-foreground">
        {/* Banner image/video */}
        {hasMedia && (
          <div className="w-full overflow-hidden" style={{ maxHeight: 340 }}>
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title="Campaign video"
                className="h-[340px] w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <img
                src={mediaUrl}
                alt="Campaign banner"
                className="h-[340px] w-full object-cover"
              />
            )}
          </div>
        )}

        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt={`${org.name} logo`}
                className="size-16 shrink-0 rounded-xl bg-white/10 object-contain p-1.5"
              />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <HeartHandshake className="size-8" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                {org.name}
              </h1>
              {org.tagline && (
                <p className="mt-1 text-base text-navy-foreground/75">{org.tagline}</p>
              )}
              {loc && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
                  <MapPin className="size-3.5" />
                  Donating at: {loc}
                </div>
              )}
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-foreground/50">
                Total raised
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                {formatMoney(totalRaised, org.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-navy-foreground/50">
                Supporters
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                {supporters.toLocaleString()}
              </p>
            </div>
            {campaigns.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-navy-foreground/50">
                  Active appeals
                </p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {campaigns.length}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_400px]">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Story */}
          {org.story && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Our story</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {org.story}
              </CardContent>
            </Card>
          )}

          {/* Campaigns with real progress */}
          {campaigns.length > 0 && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold">Current appeals</h2>
              {campaigns.map((c) => {
                const raised = campaignRaised[c.id] ?? 0;
                const target = Number(c.target_amount ?? 0);
                const pct = target > 0 ? Math.min(Math.round((raised / target) * 100), 100) : null;
                return (
                  <Card
                    key={c.id}
                    className={`cursor-pointer shadow-card ring-2 transition-all ${
                      campaignId === c.id
                        ? "ring-primary"
                        : "ring-transparent hover:ring-primary/30"
                    }`}
                    onClick={() => setCampaignId(campaignId === c.id ? null : c.id)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{c.title}</p>
                          {c.description && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
                          )}
                        </div>
                        {campaignId === c.id && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                            Selected
                          </span>
                        )}
                      </div>

                      {/* Per-campaign media */}
                      {c.media_url && (
                        <div className="mt-3 overflow-hidden rounded-lg">
                          {isYouTube(c.media_url) && youtubeEmbed(c.media_url) ? (
                            <iframe
                              src={youtubeEmbed(c.media_url)!}
                              title={c.title}
                              className="h-40 w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <img
                              src={c.media_url}
                              alt={c.title}
                              className="h-40 w-full object-cover"
                            />
                          )}
                        </div>
                      )}

                      <div className="mt-4 space-y-2">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-display text-lg font-bold tabular-nums">
                            {formatMoney(raised, org.currency)}
                          </span>
                          {target > 0 && (
                            <span className="text-muted-foreground">
                              of {formatMoney(target, org.currency)} goal
                            </span>
                          )}
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct ?? 0}%` }}
                          />
                        </div>
                        {pct !== null && (
                          <p className="text-xs text-muted-foreground">{pct}% of goal reached</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Supporter wall */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Supporters</h2>
              {supporters > 0 && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  {supporters.toLocaleString()} people gave
                </span>
              )}
            </div>

            {supportersList.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <Heart className="size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Be the first to support {org.name}.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {supportersList.map((s, i) => (
                  <Card key={i} className="shadow-card">
                    <CardContent className="flex items-start gap-3 p-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {s.display_name && s.display_name !== "Anonymous"
                          ? initials(s.display_name)
                          : "♥"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-medium">{s.display_name}</p>
                          <p className="shrink-0 font-bold tabular-nums">
                            {formatMoney(Number(s.amount), org.currency)}
                          </p>
                        </div>
                        {s.message && (
                          <p className="mt-1 text-sm italic text-muted-foreground">
                            "{s.message}"
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(s.donated_on)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — sticky */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Donation form */}
          <Card className="shadow-lift">
            {done ? (
              <CardContent className="space-y-4 py-10 text-center">
                <CheckCircle2 className="mx-auto size-12 text-success" />
                <h2 className="font-display text-2xl font-bold">Thank you!</h2>
                <p className="text-sm text-muted-foreground">
                  Your pledge of{" "}
                  <strong>{typeof amount === "number" ? new Intl.NumberFormat("en", { style: "currency", currency: org.currency.toUpperCase() }).format(amount) : ""}</strong>{" "}
                  has been sent to {org.name}.
                </p>
                {org.bank_account_number && (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-4 text-left space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bank transfer details</p>
                    {org.bank_account_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Account name</span>
                        <span className="font-medium">{org.bank_account_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Account / IBAN</span>
                      <span className="font-medium font-mono">{org.bank_account_number}</span>
                    </div>
                    {org.bank_sort_code && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sort code / BIC</span>
                        <span className="font-medium font-mono">{org.bank_sort_code}</span>
                      </div>
                    )}
                    {org.bank_reference_hint && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Reference</span>
                        <span className="font-medium">{org.bank_reference_hint}</span>
                      </div>
                    )}
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={() => setDone(false)}>
                  Make another gift
                </Button>
                {user ? (
                  <Link
                    to="/my-giving"
                    className="block text-sm underline underline-offset-2 text-muted-foreground"
                  >
                    View your giving history
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <Link
                      to="/auth"
                      search={{ mode: "signup" }}
                      className="underline underline-offset-2"
                    >
                      Create a free account
                    </Link>{" "}
                    to track your giving across all charities.
                  </p>
                )}
              </CardContent>
            ) : (
              <>
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-xl">Make a donation</CardTitle>
                  {org.payment_link_url && (
                    <a
                      href={org.payment_link_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Pay by card instantly
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Complete the form and {org.name} will be in touch to arrange payment.
                  </p>
                </CardHeader>

                <CardContent>
                  <form className="space-y-4" onSubmit={submit}>
                    {/* Amount buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      {suggested.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAmount(a)}
                          className={`rounded-lg border py-2.5 text-sm font-semibold transition-all ${
                            amount === a
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          {formatMoney(a, org.currency)}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="amount">Or enter amount</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {org.currency}
                        </span>
                        <Input
                          id="amount"
                          type="number"
                          min={1}
                          step="0.01"
                          value={amount}
                          onChange={(e) =>
                            setAmount(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          className="pl-12"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Campaign selector */}
                    {campaigns.length > 0 && (
                      <div className="space-y-1.5">
                        <Label>Give to</Label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setCampaignId(null)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                              campaignId === null
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            Where most needed
                          </button>
                          {campaigns.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCampaignId(c.id)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                campaignId === c.id
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border hover:border-primary/50"
                              }`}
                            >
                              {c.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="donor-name">Your name</Label>
                        <Input
                          id="donor-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Jane Smith"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="donor-email">Email</Label>
                        <Input
                          id="donor-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="jane@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="donor-message">Leave a message</Label>
                      <Textarea
                        id="donor-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={2}
                        placeholder="Say something to inspire others…"
                      />
                    </div>

                    <div className="space-y-2.5 rounded-xl bg-secondary p-3.5 text-sm">
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <Checkbox
                          checked={recurring}
                          onCheckedChange={(v) => setRecurring(v === true)}
                          className="mt-0.5"
                        />
                        <span>Make this a regular monthly gift</span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <Checkbox
                          checked={giftAid}
                          onCheckedChange={(v) => setGiftAid(v === true)}
                          className="mt-0.5"
                        />
                        <span>
                          Add Gift Aid — I'm a UK taxpayer and want {org.name} to claim 25% extra.
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <Checkbox
                          checked={anonymous}
                          onCheckedChange={(v) => setAnonymous(v === true)}
                          className="mt-0.5"
                        />
                        <span>Keep my gift anonymous</span>
                      </label>
                    </div>

                    <Button type="submit" size="lg" className="w-full" disabled={busy}>
                      {busy ? "Sending…" : `Give now`}
                    </Button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>

          {/* Share / QR */}
          <Card className="shadow-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Share2 className="size-4 text-primary" />
                Share this page
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Scan or share the link to help {org.name} reach more supporters.
              </p>
              <div className="mt-4 flex justify-center rounded-xl bg-white p-4">
                <QRCode value={pageUrl} size={140} level="M" />
              </div>
              <p className="mt-3 break-all text-center text-[10px] text-muted-foreground">
                {pageUrl}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(pageUrl);
                  toast.success("Link copied!");
                }}
                className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                Copy link
              </button>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <Link to="/" className="underline underline-offset-2">
          Givewell
        </Link>{" "}
        · Donation management for charities
      </footer>
    </div>
  );
}
