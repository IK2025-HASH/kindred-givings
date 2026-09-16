import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, Send, Users } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useDonors } from "@/hooks/useOrgData";
import { supabase } from "@/integrations/supabase/client";
import { sendEmailCampaign } from "@/lib/send-email-campaign.functions";

export const Route = createFileRoute("/_authenticated/app/email")({
  head: () => ({
    meta: [{ title: "Email Campaigns — Givewell" }],
  }),
  component: EmailCampaignsPage,
});

type EmailCampaign = {
  id: string;
  title: string;
  subject: string;
  body: string;
  audience_filter: { all?: boolean; gift_aid_only?: boolean };
  status: "draft" | "sent";
  recipient_count: number;
  sent_at: string | null;
  created_at: string;
};

type Draft = Partial<Pick<EmailCampaign, "title" | "subject" | "body" | "audience_filter">>;

function EmailCampaignsPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const qc = useQueryClient();
  const donors = useDonors(orgId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const campaigns = useQuery({
    queryKey: ["email-campaigns", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<EmailCampaign[]> => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmailCampaign[];
    },
  });

  const donorsWithEmail = (donors.data ?? []).filter((d) => d.email);
  const giftAidWithEmail = donorsWithEmail.filter((d) => d.gift_aid_declaration);

  function estimatedRecipients(filter: Draft["audience_filter"] = { all: true }) {
    if (filter?.gift_aid_only) return giftAidWithEmail.length;
    return donorsWithEmail.length;
  }

  async function saveDraft() {
    if (!orgId || !draft?.title || !draft?.subject || !draft?.body) return;
    const payload = {
      organization_id: orgId,
      title: draft.title,
      subject: draft.subject,
      body: draft.body,
      audience_filter: draft.audience_filter ?? { all: true },
      status: "draft" as const,
    };
    const { error } = await supabase.from("email_campaigns").insert(payload as never);
    if (error) return toast.error(error.message);
    toast.success("Campaign saved as draft");
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ["email-campaigns", orgId] });
  }

  async function send(campaign: EmailCampaign) {
    if (!orgId) return;
    if (!confirm(`Send "${campaign.subject}" to ${estimatedRecipients(campaign.audience_filter)} donors?`)) return;
    setSending(campaign.id);
    try {
      const result = await sendEmailCampaign({ data: { campaignId: campaign.id, orgId } });
      toast.success(`Sent to ${result.sent} donors`);
      void qc.invalidateQueries({ queryKey: ["email-campaigns", orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  }

  async function deleteCampaign(id: string) {
    const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    void qc.invalidateQueries({ queryKey: ["email-campaigns", orgId] });
  }

  const giftAidOnly = draft?.audience_filter?.gift_aid_only ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Campaigns"
        description="Send targeted emails to your donors. Personalise by Gift Aid status or tag."
        action={
          <Button onClick={() => setDraft({ audience_filter: { all: true } })}>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Donors with email</p>
              <p className="font-display text-xl font-bold">{donorsWithEmail.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center gap-3 py-4">
            <Mail className="size-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Gift Aid eligible</p>
              <p className="font-display text-xl font-bold">{giftAidWithEmail.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center gap-3 py-4">
            <Send className="size-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Campaigns sent</p>
              <p className="font-display text-xl font-bold">
                {(campaigns.data ?? []).filter((c) => c.status === "sent").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template hint */}
      <div className="rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Personalisation:</strong> Use{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{name}}"}</code> in the body to
        insert the donor's name, and{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{org}}"}</code> for your charity
        name. Emails are sent via{" "}
        <strong className="text-foreground">Resend</strong> — set your{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">RESEND_API_KEY</code> environment
        variable to enable sending.
      </div>

      {/* Campaign list */}
      {campaigns.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : (campaigns.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Mail className="size-10 text-muted-foreground/50" />
          <p className="font-medium">No campaigns yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Write an email to all your donors or a Gift Aid-only segment in minutes.
          </p>
          <Button onClick={() => setDraft({ audience_filter: { all: true } })} className="mt-2">
            <Plus className="size-4" /> Create your first campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {(campaigns.data ?? []).map((c) => (
            <Card key={c.id} className="shadow-card">
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{c.title}</p>
                    <Badge variant={c.status === "sent" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                    {c.audience_filter?.gift_aid_only && (
                      <Badge variant="outline" className="text-xs">Gift Aid only</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">Subject: {c.subject}</p>
                  {c.status === "sent" ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sent to {c.recipient_count} donors
                      {c.sent_at && ` · ${new Date(c.sent_at).toLocaleDateString("en-GB")}`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Draft · ~{estimatedRecipients(c.audience_filter)} recipients
                    </p>
                  )}
                </div>
                {c.status === "draft" && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => void send(c)}
                      disabled={sending === c.id || donorsWithEmail.length === 0}
                    >
                      <Send className="size-3.5" />
                      {sending === c.id ? "Sending…" : "Send"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void deleteCampaign(c.id)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Compose dialog */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New email campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ec-title">Campaign name</Label>
              <Input
                id="ec-title"
                placeholder="e.g. Winter Appeal thank-you"
                value={draft?.title ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Internal name — donors don't see this.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ec-subject">Email subject</Label>
              <Input
                id="ec-subject"
                placeholder="e.g. Thank you for your support, {{name}}"
                value={draft?.subject ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ec-body">Email body</Label>
              <Textarea
                id="ec-body"
                rows={10}
                placeholder={`Dear {{name}},\n\nThank you for your generous support of {{org}}...\n\nWith gratitude,\n{{org}}`}
                value={draft?.body ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Gift Aid donors only</p>
                  <p className="text-xs text-muted-foreground">
                    Send only to donors with a signed Gift Aid declaration
                    ({giftAidWithEmail.length} donors)
                  </p>
                </div>
                <Switch
                  checked={giftAidOnly}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({
                      ...d,
                      audience_filter: { gift_aid_only: checked },
                    }))
                  }
                />
              </div>

              <p className="mt-3 text-xs font-medium text-muted-foreground">
                Estimated recipients:{" "}
                <span className="font-bold text-foreground">
                  {estimatedRecipients(draft?.audience_filter)}
                </span>{" "}
                donors with email addresses
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveDraft()}
              disabled={!draft?.title || !draft?.subject || !draft?.body}
            >
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
