import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canEdit, useAuth } from "@/hooks/useAuth";
import { useCampaigns, useDonations, useSubscription, type Campaign } from "@/hooks/useOrgData";
import { formatDate, formatMoney, slugify } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Givewell workspace" },
      {
        name: "description",
        content: "Create fundraising appeals with targets and watch progress in real time.",
      },
      { property: "og:title", content: "Fundraising campaigns in Givewell" },
      { property: "og:description", content: "Appeals, targets and live progress." },
    ],
  }),
  component: CampaignsPage,
});

type Draft = Partial<Campaign>;

function CampaignsPage() {
  const { currentOrg, currentRole } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const currency = currentOrg?.currency ?? "GBP";
  const campaigns = useCampaigns(orgId);
  const donations = useDonations(orgId);
  const subscription = useSubscription(orgId);
  const qc = useQueryClient();
  const editable = canEdit(currentRole);
  const [draft, setDraft] = useState<Draft | null>(null);

  const raised = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of donations.data ?? []) {
      if (d.status !== "confirmed" || !d.campaign_id) continue;
      map.set(d.campaign_id, (map.get(d.campaign_id) ?? 0) + d.amount);
    }
    return map;
  }, [donations.data]);

  async function save() {
    if (!orgId || !draft?.title) return;
    if (!draft.id) {
      const limit = subscription.data?.plan?.max_campaigns;
      if (limit !== undefined && (campaigns.data?.length ?? 0) >= limit) {
        toast.error(`Your plan allows ${limit} campaigns. Upgrade to add more.`);
        return;
      }
    }
    const payload = {
      organization_id: orgId,
      title: draft.title,
      slug: slugify(draft.slug || draft.title),
      description: draft.description || null,
      target_amount: draft.target_amount ? Number(draft.target_amount) : null,
      starts_on: draft.starts_on || null,
      ends_on: draft.ends_on || null,
      status: (draft.status ?? "active") as Campaign["status"],
      media_url: (draft as Campaign).media_url || null,
    };
    const res = draft.id
      ? await supabase.from("campaigns").update(payload).eq("id", draft.id)
      : await supabase.from("campaigns").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(draft.id ? "Campaign updated" : "Campaign created");
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campaign deleted");
    void qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Appeals with a target, shown on your public giving page."
        action={
          editable ? (
            <Button onClick={() => setDraft({ title: "", status: "active" })}>New campaign</Button>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {(campaigns.data ?? []).map((c) => {
          const total = raised.get(c.id) ?? 0;
          const target = Number(c.target_amount ?? 0);
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.starts_on ? formatDate(c.starts_on) : "No start date"} —{" "}
                    {c.ends_on ? formatDate(c.ends_on) : "ongoing"}
                  </p>
                </div>
                <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                )}
                <Progress value={target > 0 ? Math.min(100, (total / target) * 100) : 0} />
                <p className="text-sm">
                  <span className="font-semibold">{formatMoney(total, currency)}</span>
                  {target > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      raised of {formatMoney(target, currency)}
                    </span>
                  )}
                </p>
                {editable && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDraft(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(c.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {(campaigns.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
        )}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit campaign" : "New campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={draft?.title ?? ""}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={draft?.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="media_url">Campaign image or video URL</Label>
              <Input
                id="media_url"
                type="url"
                value={(draft as Campaign)?.media_url ?? ""}
                onChange={(e) => setDraft({ ...draft, media_url: e.target.value } as Campaign)}
                placeholder="https://... (image URL or YouTube link)"
              />
              <p className="text-xs text-muted-foreground">
                Shown on the public giving page for this campaign.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="target">Target amount</Label>
                <Input
                  id="target"
                  type="number"
                  min="0"
                  value={draft?.target_amount ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, target_amount: Number(e.target.value) || null })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={draft?.status ?? "active"}
                  onValueChange={(v) => setDraft({ ...draft, status: v as Campaign["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["draft", "active", "completed", "archived"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="starts">Starts</Label>
                <Input
                  id="starts"
                  type="date"
                  value={draft?.starts_on ?? ""}
                  onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ends">Ends</Label>
                <Input
                  id="ends"
                  type="date"
                  value={draft?.ends_on ?? ""}
                  onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!draft?.title}>
              Save campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
