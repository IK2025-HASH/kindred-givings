import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canEdit, useAuth } from "@/hooks/useAuth";
import { useCampaigns, useDonations, useDonors, type Donation } from "@/hooks/useOrgData";
import { downloadCsv, formatDate, formatMoney } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/donations")({
  head: () => ({
    meta: [
      { title: "Donations — Givewell workspace" },
      {
        name: "description",
        content: "Record gifts, confirm online donations and export your giving history.",
      },
      { property: "og:title", content: "Donation records in Givewell" },
      { property: "og:description", content: "Record, confirm and export donations." },
    ],
  }),
  component: DonationsPage,
});

const METHODS = ["cash", "bank_transfer", "cheque", "card", "online", "other"] as const;
const STATUSES = ["pending", "confirmed", "refunded", "failed"] as const;

type Draft = Partial<Donation>;

function DonationsPage() {
  const { currentOrg, currentRole } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const currency = currentOrg?.currency ?? "GBP";
  const donations = useDonations(orgId);
  const donors = useDonors(orgId);
  const campaigns = useCampaigns(orgId);
  const qc = useQueryClient();
  const editable = canEdit(currentRole);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const donorName = (d: Donation) =>
    d.is_anonymous
      ? "Anonymous"
      : (donors.data?.find((x) => x.id === d.donor_id)?.full_name ?? d.donor_name ?? "Supporter");

  const list = (donations.data ?? []).filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [donorName(d), d.reference, d.donor_email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["donations", orgId] });
  }

  async function save() {
    if (!orgId || !draft?.amount) return;
    const payload = {
      organization_id: orgId,
      donor_id: draft.donor_id || null,
      campaign_id: draft.campaign_id || null,
      amount: Number(draft.amount),
      currency,
      donated_on: draft.donated_on || new Date().toISOString().slice(0, 10),
      method: (draft.method ?? "cash") as Donation["method"],
      status: (draft.status ?? "confirmed") as Donation["status"],
      is_recurring: !!draft.is_recurring,
      gift_aid: !!draft.gift_aid,
      is_anonymous: !!draft.is_anonymous,
      reference: draft.reference || null,
      message: draft.message || null,
    };
    const res = draft.id
      ? await supabase.from("donations").update(payload).eq("id", draft.id)
      : await supabase.from("donations").insert({ ...payload, source: "manual" });
    if (res.error) return toast.error(res.error.message);
    toast.success(draft.id ? "Donation updated" : "Donation recorded");
    setDraft(null);
    refresh();
  }

  async function setStatus(id: string, status: Donation["status"]) {
    const { error } = await supabase.from("donations").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Donation ${status}`);
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("donations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Donation deleted");
    refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donations"
        description="Every gift recorded by your team or received through your giving page."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "donations.csv",
                  list.map((d) => ({
                    date: d.donated_on,
                    donor: donorName(d),
                    amount: d.amount,
                    currency: d.currency,
                    method: d.method,
                    status: d.status,
                    campaign: campaigns.data?.find((c) => c.id === d.campaign_id)?.title ?? "",
                    gift_aid: d.gift_aid,
                    recurring: d.is_recurring,
                    reference: d.reference ?? "",
                  })),
                )
              }
            >
              Export
            </Button>
            {editable && (
              <Button
                onClick={() =>
                  setDraft({
                    amount: 0,
                    method: "cash",
                    status: "confirmed",
                    donated_on: new Date().toISOString().slice(0, 10),
                  })
                }
              >
                Record donation
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search donor or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="hidden lg:table-cell">Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(d.donated_on)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{donorName(d)}</div>
                    <div className="flex gap-1 pt-1">
                      {d.gift_aid && (
                        <Badge variant="secondary" className="text-[10px]">
                          Gift Aid
                        </Badge>
                      )}
                      {d.is_recurring && (
                        <Badge variant="secondary" className="text-[10px]">
                          Recurring
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(d.amount, d.currency)}
                  </TableCell>
                  <TableCell className="hidden capitalize md:table-cell">
                    {d.method.replace("_", " ")}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {campaigns.data?.find((c) => c.id === d.campaign_id)?.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.status === "confirmed" ? "default" : "secondary"}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <div className="flex justify-end gap-1">
                        {d.status === "pending" && (
                          <Button size="sm" onClick={() => void setStatus(d.id, "confirmed")}>
                            Confirm
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDraft(d)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(d.id)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No donations match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit donation" : "Record donation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft?.amount ?? ""}
                  onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={draft?.donated_on ?? ""}
                  onChange={(e) => setDraft({ ...draft, donated_on: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Donor</Label>
              <Select
                value={draft?.donor_id ?? "none"}
                onValueChange={(v) => setDraft({ ...draft, donor_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a donor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked donor</SelectItem>
                  {(donors.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campaign</Label>
              <Select
                value={draft?.campaign_id ?? "none"}
                onValueChange={(v) => setDraft({ ...draft, campaign_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="General fund" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General fund</SelectItem>
                  {(campaigns.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select
                  value={draft?.method ?? "cash"}
                  onValueChange={(v) => setDraft({ ...draft, method: v as Donation["method"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={draft?.status ?? "confirmed"}
                  onValueChange={(v) => setDraft({ ...draft, status: v as Donation["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={draft?.reference ?? ""}
                onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={!!draft?.gift_aid}
                  onCheckedChange={(v) => setDraft({ ...draft, gift_aid: v === true })}
                />
                Gift Aid
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={!!draft?.is_recurring}
                  onCheckedChange={(v) => setDraft({ ...draft, is_recurring: v === true })}
                />
                Recurring
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={!!draft?.is_anonymous}
                  onCheckedChange={(v) => setDraft({ ...draft, is_anonymous: v === true })}
                />
                Anonymous
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!draft?.amount}>
              Save donation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
