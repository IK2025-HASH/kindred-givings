import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canManageOrg, useAuth } from "@/hooks/useAuth";
import { slugify } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Givewell workspace" },
      {
        name: "description",
        content: "Update your charity details, giving page and notification settings.",
      },
    ],
  }),
  component: SettingsPage,
});

const CURRENCIES: { code: string; name: string }[] = [
  { code: "GBP", name: "British Pound" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "INR", name: "Indian Rupee" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "THB", name: "Thai Baht" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "ZAR", name: "South African Rand" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "ETB", name: "Ethiopian Birr" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "XOF", name: "West African CFA Franc" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "COP", name: "Colombian Peso" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "CLP", name: "Chilean Peso" },
  { code: "PEN", name: "Peruvian Sol" },
];

function SettingsPage() {
  const { currentOrg, currentRole, refreshMemberships } = useAuth();
  const qc = useQueryClient();
  const canManage = canManageOrg(currentRole);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [story, setStory] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [charityNumber, setCharityNumber] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [paymentLinkUrl, setPaymentLinkUrl] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankReferenceHint, setBankReferenceHint] = useState("");
  const [suggestedAmounts, setSuggestedAmounts] = useState("10,25,50,100");
  const [publicPageEnabled, setPublicPageEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    if (!currentOrg) return;
    setName(currentOrg.name);
    setSlug(currentOrg.slug);
    setTagline(currentOrg.tagline ?? "");
    setStory(currentOrg.story ?? "");
    setCurrency(currentOrg.currency);
    setContactEmail(currentOrg.contact_email ?? "");
    setContactPhone(currentOrg.contact_phone ?? "");
    setWebsite(currentOrg.website ?? "");
    setCharityNumber(currentOrg.charity_number ?? "");
    setLogoUrl(currentOrg.logo_url ?? "");
    setBannerUrl(currentOrg.banner_url ?? "");
    setPaymentLinkUrl(currentOrg.payment_link_url ?? "");
    setBankAccountName(currentOrg.bank_account_name ?? "");
    setBankAccountNumber(currentOrg.bank_account_number ?? "");
    setBankSortCode(currentOrg.bank_sort_code ?? "");
    setBankReferenceHint(currentOrg.bank_reference_hint ?? "");
    setSuggestedAmounts((currentOrg.suggested_amounts ?? [10, 25, 50, 100]).join(","));
    setPublicPageEnabled(currentOrg.public_page_enabled);
  }, [currentOrg]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setBusy(true);
    const amounts = suggestedAmounts
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => !isNaN(v) && v > 0)
      .slice(0, 6);

    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name,
          slug: slugify(slug || name),
          tagline: tagline || null,
          story: story || null,
          currency,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          website: website || null,
          charity_number: charityNumber || null,
          logo_url: logoUrl || null,
          banner_url: bannerUrl || null,
          payment_link_url: paymentLinkUrl || null,
          bank_account_name: bankAccountName || null,
          bank_account_number: bankAccountNumber || null,
          bank_sort_code: bankSortCode || null,
          bank_reference_hint: bankReferenceHint || null,
          suggested_amounts: amounts.length ? amounts : [10, 25, 50, 100],
          public_page_enabled: publicPageEnabled,
        })
        .eq("id", currentOrg.id);
      if (error) throw error;
      toast.success("Settings saved");
      refreshMemberships();
      void qc.invalidateQueries({ queryKey: ["memberships"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOrg() {
    if (!currentOrg || deleteConfirm !== currentOrg.name) return;
    const { error } = await supabase.from("organizations").delete().eq("id", currentOrg.id);
    if (error) return toast.error(error.message);
    toast.success("Charity workspace deleted");
    void qc.invalidateQueries({ queryKey: ["memberships"] });
    window.location.href = "/app";
  }

  if (!currentOrg) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your charity details and giving page configuration." />

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Charity details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-name">Charity name</Label>
                <Input
                  id="s-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-slug">Giving page URL</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">/give/</span>
                  <Input
                    id="s-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-tagline">Tagline</Label>
              <Input
                id="s-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="A short line about your mission"
                disabled={!canManage}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-story">Our story</Label>
              <Textarea
                id="s-story"
                rows={4}
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="Tell supporters what your charity does and why it matters"
                disabled={!canManage}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-email">Contact email</Label>
                <Input
                  id="s-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-phone">Contact phone</Label>
                <Input
                  id="s-phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-website">Website</Label>
                <Input
                  id="s-website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-cn">Charity number</Label>
                <Input
                  id="s-cn"
                  value={charityNumber}
                  onChange={(e) => setCharityNumber(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-logo">Logo URL</Label>
                <Input
                  id="s-logo"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-banner">Banner image or video URL</Label>
                <Input
                  id="s-banner"
                  type="url"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://... (image URL or YouTube link)"
                  disabled={!canManage}
                />
                <p className="text-xs text-muted-foreground">
                  Shown at the top of your giving page. Paste an image URL or a YouTube video link.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={!canManage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Giving page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Public giving page enabled</p>
                <p className="text-xs text-muted-foreground">
                  Allow supporters to find and donate at /give/{slug || slugify(name)}
                </p>
              </div>
              <Switch
                checked={publicPageEnabled}
                onCheckedChange={setPublicPageEnabled}
                disabled={!canManage}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-amounts">Suggested donation amounts</Label>
              <Input
                id="s-amounts"
                value={suggestedAmounts}
                onChange={(e) => setSuggestedAmounts(e.target.value)}
                placeholder="10,25,50,100"
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">Comma-separated numbers, up to 6.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-payment">Card payment link</Label>
              <Input
                id="s-payment"
                type="url"
                value={paymentLinkUrl}
                onChange={(e) => setPaymentLinkUrl(e.target.value)}
                placeholder="https://buy.stripe.com/... or similar"
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">
                If set, a "Pay by card" button appears on your giving page. Use a Stripe Payment
                Link or equivalent.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Donors who make a bank transfer will see these details on the thank-you screen after pledging.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-bank-name">Account name</Label>
                <Input
                  id="s-bank-name"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="e.g. Sunrise Children's Foundation"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-bank-number">Account number / IBAN</Label>
                <Input
                  id="s-bank-number"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="e.g. 12345678 or AE070331234567890123456"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-bank-sort">Sort code / BIC / Routing</Label>
                <Input
                  id="s-bank-sort"
                  value={bankSortCode}
                  onChange={(e) => setBankSortCode(e.target.value)}
                  placeholder="e.g. 20-00-00 or NBADAEAAXXXX"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-bank-ref">Payment reference for donors</Label>
                <Input
                  id="s-bank-ref"
                  value={bankReferenceHint}
                  onChange={(e) => setBankReferenceHint(e.target.value)}
                  placeholder="e.g. Your name + GIVE"
                  disabled={!canManage}
                />
                <p className="text-xs text-muted-foreground">
                  Shown as a hint so donors use a reference you can reconcile.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {canManage && (
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        )}
      </form>

      {currentRole === "owner" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Permanently delete this charity workspace and all its data. This cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="del-confirm">
                Type <strong>{currentOrg.name}</strong> to confirm
              </Label>
              <Input
                id="del-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== currentOrg.name}
              onClick={() => void deleteOrg()}
            >
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
