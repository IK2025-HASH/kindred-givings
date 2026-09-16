import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { updatePartnerBranding } from "@/lib/partner.functions";

export const Route = createFileRoute("/_authenticated/partner/branding")({
  head: () => ({ meta: [{ title: "White-label Branding — Partner Portal" }] }),
  component: PartnerBrandingPage,
});

type Partner = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  custom_domain: string | null;
};

function PartnerBrandingPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [customDomain, setCustomDomain] = useState("");

  const partnerQ = useQuery({
    queryKey: ["my-partner"],
    queryFn: async (): Promise<Partner | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("partner_members")
        .select("partners(id, name, logo_url, primary_color, custom_domain)")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.partners as unknown as Partner) ?? null;
    },
  });

  const partner = partnerQ.data;

  useEffect(() => {
    if (!partner) return;
    setLogoUrl(partner.logo_url ?? "");
    setPrimaryColor(partner.primary_color ?? "#3B82F6");
    setCustomDomain(partner.custom_domain ?? "");
  }, [partner]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!partner) return;
    setBusy(true);
    try {
      await updatePartnerBranding({
        data: { partnerId: partner.id, logoUrl, primaryColor, customDomain },
      });
      toast.success("Branding saved");
      void qc.invalidateQueries({ queryKey: ["my-partner"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setBusy(false);
    }
  }

  if (partnerQ.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">White-label branding</h1>
        <p className="text-sm text-muted-foreground">
          Customise the look of your client-facing product. Your logo and colours replace Givewell's on all giving pages and emails served under your partner account.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* Logo & colour */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4" /> Brand identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="b-logo">Logo URL</Label>
              <Input
                id="b-logo"
                type="url"
                placeholder="https://yourbrand.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                PNG or SVG, transparent background recommended. Appears in the header of giving pages and partner emails.
              </p>
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="mt-2 h-12 rounded border border-border object-contain p-1"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-color">Primary colour</Label>
              <div className="flex items-center gap-3">
                <input
                  id="b-color-picker"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-border bg-background p-1"
                />
                <Input
                  id="b-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#3B82F6"
                  className="w-36 font-mono"
                />
                <div
                  className="flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white shadow-sm"
                  style={{ background: primaryColor }}
                >
                  Preview button
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Used for buttons, links and accents across all client giving pages. Must be a 6-digit hex value, e.g. #E84040.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Custom domain */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" /> Custom domain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="b-domain">Domain</Label>
              <Input
                id="b-domain"
                placeholder="giving.yourfirm.co.uk"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter a subdomain you control, e.g. <code className="rounded bg-muted px-1">giving.yourfirm.co.uk</code>. After saving, add a DNS CNAME record pointing it to <code className="rounded bg-muted px-1">cname.givewell.charity</code> and contact support to complete SSL setup.
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">Custom domain setup steps</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">
                <li>Save your domain name here</li>
                <li>In your DNS provider, create a CNAME record: <br/><code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">{customDomain || "giving.yourfirm.co.uk"}</code> → <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">cname.givewell.charity</code></li>
                <li>Email <strong>partners@givewell.charity</strong> with your domain — we'll provision the SSL certificate (usually within 24 hours)</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save branding"}
        </Button>
      </form>
    </div>
  );
}
