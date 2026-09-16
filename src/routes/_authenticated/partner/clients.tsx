import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, ExternalLink, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, slugify } from "@/lib/format";
import { createClientOrg } from "@/lib/partner.functions";

export const Route = createFileRoute("/_authenticated/partner/clients")({
  head: () => ({ meta: [{ title: "Client Charities — Partner Portal" }] }),
  component: PartnerClientsPage,
});

type ClientSummary = {
  org_id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  member_count: number;
  donation_total: number;
};

type NewClient = {
  name: string;
  slug: string;
  contactEmail: string;
  currency: string;
};

function PartnerClientsPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<NewClient>({ name: "", slug: "", contactEmail: "", currency: "GBP" });

  const partnerQ = useQuery({
    queryKey: ["my-partner"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("partner_members")
        .select("partners(id, name)")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.partners as unknown as { id: string; name: string }) ?? null;
    },
  });

  const partnerId = partnerQ.data?.id;

  const clientsQ = useQuery({
    queryKey: ["partner-clients", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<ClientSummary[]> => {
      const { data, error } = await supabase
        .from("partner_client_summary")
        .select("*")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientSummary[];
    },
  });

  const clients = clientsQ.data ?? [];

  function openAdd() {
    setForm({ name: "", slug: "", contactEmail: "", currency: "GBP" });
    setAdding(true);
  }

  async function handleCreate() {
    if (!partnerId || !form.name || !form.slug) return;
    setBusy(true);
    try {
      const result = await createClientOrg({
        data: {
          partnerId,
          orgName: form.name,
          orgSlug: form.slug,
          contactEmail: form.contactEmail || undefined,
          currency: form.currency,
        },
      });
      toast.success(`Workspace created for ${result.org.name}`);
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["partner-clients", partnerId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(orgId: string, current: string) {
    const next = current === "active" ? "suspended" : "active";
    const { error } = await supabase
      .from("organizations")
      .update({ status: next } as never)
      .eq("id", orgId);
    if (error) return toast.error(error.message);
    toast.success(`Client ${next}`);
    void qc.invalidateQueries({ queryKey: ["partner-clients", partnerId] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Client charities</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage charity workspaces on behalf of your clients.
          </p>
        </div>
        <Button onClick={openAdd} disabled={!partnerId}>
          <Plus className="size-4" /> Add client
        </Button>
      </div>

      {clientsQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Building2 className="size-10 text-muted-foreground/40" />
          <p className="font-medium">No clients yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Click "Add client" to create a charity workspace for your first client.
          </p>
          <Button onClick={openAdd} className="mt-2"><Plus className="size-4" /> Add client</Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charity</TableHead>
                  <TableHead>Giving page</TableHead>
                  <TableHead className="text-right">Team</TableHead>
                  <TableHead className="text-right">Total raised</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.org_id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <a
                        href={`/give/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        /give/{c.slug}
                        <ExternalLink className="size-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.member_count}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatMoney(c.donation_total, "GBP")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => void toggleStatus(c.org_id, c.status)}
                      >
                        {c.status === "active" ? "Suspend" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add client dialog */}
      <Dialog open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add client charity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Charity name</Label>
              <Input
                id="c-name"
                placeholder="e.g. Sunrise Children's Foundation"
                value={form.name}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  slug: slugify(e.target.value),
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-slug">Giving page URL</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">/give/</span>
                <Input
                  id="c-slug"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="charity-name"
                />
              </div>
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers and hyphens only.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Contact email <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="c-email"
                type="email"
                placeholder="contact@thecharity.org"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GBP", "USD", "EUR", "AUD", "CAD"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={busy || !form.name || !form.slug}>
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
