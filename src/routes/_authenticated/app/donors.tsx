import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canEdit, useAuth } from "@/hooks/useAuth";
import { useDonations, useDonors, useSubscription, type Donor } from "@/hooks/useOrgData";
import { downloadCsv, formatDate, formatMoney } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/donors")({
  head: () => ({
    meta: [
      { title: "Donors — Givewell workspace" },
      {
        name: "description",
        content: "Search your supporters, see lifetime giving and keep contact details up to date.",
      },
      { property: "og:title", content: "Donor records in Givewell" },
      { property: "og:description", content: "Supporter contact details and lifetime giving." },
    ],
  }),
  component: DonorsPage,
});

type Draft = Partial<Donor> & { full_name?: string };

function DonorsPage() {
  const { currentOrg, currentRole } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const currency = currentOrg?.currency ?? "GBP";
  const donors = useDonors(orgId);
  const donations = useDonations(orgId);
  const subscription = useSubscription(orgId);
  const qc = useQueryClient();
  const editable = canEdit(currentRole);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const map = new Map<string, { total: number; last: string | null }>();
    for (const d of donations.data ?? []) {
      if (!d.donor_id || d.status !== "confirmed") continue;
      const prev = map.get(d.donor_id) ?? { total: 0, last: null };
      map.set(d.donor_id, {
        total: prev.total + d.amount,
        last: !prev.last || d.donated_on > prev.last ? d.donated_on : prev.last,
      });
    }
    return map;
  }, [donations.data]);

  const list = (donors.data ?? []).filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [d.full_name, d.email, d.phone, d.city, d.tags.join(" ")]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  async function save() {
    if (!orgId || !draft?.full_name) return;
    if (!draft.id) {
      const limit = subscription.data?.plan?.max_donors;
      if (limit !== undefined && (donors.data?.length ?? 0) >= limit) {
        toast.error(`Your plan allows ${limit} donors. Upgrade to add more.`);
        return;
      }
    }
    setBusy(true);
    try {
      const payload = {
        organization_id: orgId,
        full_name: draft.full_name,
        email: draft.email || null,
        phone: draft.phone || null,
        address_line1: draft.address_line1 || null,
        city: draft.city || null,
        postcode: draft.postcode || null,
        notes: draft.notes || null,
        gift_aid_declaration: !!draft.gift_aid_declaration,
        tags: draft.tags ?? [],
      };
      const res = draft.id
        ? await supabase.from("donors").update(payload).eq("id", draft.id)
        : await supabase.from("donors").insert(payload);
      if (res.error) throw res.error;
      toast.success(draft.id ? "Donor updated" : "Donor added");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["donors", orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the donor");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("donors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Donor removed");
    void qc.invalidateQueries({ queryKey: ["donors", orgId] });
  }

  async function importCsv(file: File) {
    if (!orgId) return;
    const text = await file.text();
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    if (!headerLine) return;
    const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
    const rows = lines
      .map((line) => {
        const cells = line.split(",");
        const get = (name: string) => {
          const i = headers.indexOf(name);
          return i >= 0 ? (cells[i] ?? "").trim() : "";
        };
        const name = get("full_name") || get("name");
        if (!name) return null;
        return {
          organization_id: orgId,
          full_name: name,
          email: get("email") || null,
          phone: get("phone") || null,
          city: get("city") || null,
          postcode: get("postcode") || null,
        };
      })
      .filter(Boolean) as Record<string, unknown>[];
    if (rows.length === 0) return toast.error("No donors found in that file");
    const { error } = await supabase.from("donors").insert(rows as never);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${rows.length} donors`);
    void qc.invalidateQueries({ queryKey: ["donors", orgId] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donors"
        description="Everyone who supports your charity."
        action={
          editable ? (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importCsv(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadCsv(
                    "donors.csv",
                    list.map((d) => ({
                      full_name: d.full_name,
                      email: d.email,
                      phone: d.phone,
                      city: d.city,
                      postcode: d.postcode,
                      lifetime_total: totals.get(d.id)?.total ?? 0,
                    })),
                  )
                }
              >
                Export
              </Button>
              <Dialog
                open={!!draft}
                onOpenChange={(o) => setDraft(o ? (draft ?? { full_name: "" }) : null)}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => setDraft({ full_name: "" })}>Add donor</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{draft?.id ? "Edit donor" : "Add donor"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    {(
                      [
                        ["full_name", "Full name"],
                        ["email", "Email"],
                        ["phone", "Phone"],
                        ["address_line1", "Address"],
                        ["city", "City"],
                        ["postcode", "Postcode"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={key}>{label}</Label>
                        <Input
                          id={key}
                          value={(draft?.[key] as string) ?? ""}
                          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                        />
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={draft?.notes ?? ""}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!draft?.gift_aid_declaration}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, gift_aid_declaration: v === true })
                        }
                      />
                      Gift Aid declaration on file
                    </label>
                  </div>
                  <DialogFooter>
                    <Button onClick={save} disabled={busy || !draft?.full_name}>
                      Save donor
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null
        }
      />

      <Input
        placeholder="Search by name, email, phone or town"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead>Lifetime</TableHead>
                <TableHead className="hidden md:table-cell">Last gift</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{d.full_name}</div>
                    {d.gift_aid_declaration && (
                      <Badge variant="secondary" className="mt-1">
                        Gift Aid
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    <div>{d.email ?? "—"}</div>
                    <div>{d.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(totals.get(d.id)?.total ?? 0, currency)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDate(totals.get(d.id)?.last ?? null)}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <div className="flex justify-end gap-2">
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
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No donors yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
