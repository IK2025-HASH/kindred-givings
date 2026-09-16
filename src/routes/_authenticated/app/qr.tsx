import { createFileRoute } from "@tanstack/react-router";
import QRCode from "react-qr-code";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, MapPin, Plus, Printer, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useOrgData";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/qr")({
  head: () => ({
    meta: [{ title: "QR Donation Boxes — Givewell" }],
  }),
  component: QrBoxesPage,
});

type Box = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
};

type DonationRow = {
  source_location: string | null;
  amount: number;
  status: string;
  currency: string;
};

type BoxStats = {
  total: number;
  confirmed: number;
  count: number;
  currency: string;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const STORAGE_KEY = "givewell_qr_boxes";

function loadBoxes(orgId: string): Box[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${orgId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBoxes(orgId: string, boxes: Box[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${orgId}`, JSON.stringify(boxes));
  } catch {
    // ignore
  }
}

function QrPrintDialog({ box, giveUrl }: { box: Box; giveUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function print() {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>QR — ${box.name}</title>
  <style>
    body { margin: 0; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; font-family: system-ui; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 4px; text-align: center; }
    p  { font-size: 14px; color: #555; margin-bottom: 24px; text-align: center; }
    svg { width: 240px; height: 240px; }
    .url { margin-top: 16px; font-size: 11px; color: #888; word-break: break-all;
           max-width: 240px; text-align: center; }
    .scan { margin-top: 20px; font-size: 15px; font-weight: 600; color: #333; }
  </style>
</head>
<body>
  <h1>${box.name}</h1>
  ${box.location ? `<p>${box.location}</p>` : ""}
  ${svg.outerHTML}
  <p class="scan">Scan to donate</p>
  <div class="url">${giveUrl}</div>
</body>
</html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function downloadSvg() {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${box.name.toLowerCase().replace(/\s+/g, "-")}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR code downloaded");
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-display">{box.name}</DialogTitle>
        {box.location && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {box.location}
          </p>
        )}
      </DialogHeader>
      <div ref={ref} className="flex justify-center rounded-xl bg-white p-6">
        <QRCode value={giveUrl} size={192} level="M" />
      </div>
      <p className="break-all text-center text-[11px] text-muted-foreground">{giveUrl}</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={downloadSvg}>
          <Download className="size-4" /> Save SVG
        </Button>
        <Button className="flex-1" onClick={print}>
          <Printer className="size-4" /> Print
        </Button>
      </div>
    </DialogContent>
  );
}

function StatPill({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function QrBoxesPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";
  const orgSlug = currentOrg?.slug ?? "";
  const orgCurrency = currentOrg?.currency ?? "GBP";
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const subscription = useSubscription(orgId || null);

  const [boxes, setBoxes] = useState<Box[]>(() => loadBoxes(orgId));
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [open, setOpen] = useState(false);

  // Fetch all donations that came via QR boxes for this org
  const statsQuery = useQuery({
    queryKey: ["qr-box-stats", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Record<string, BoxStats>> => {
      const { data, error } = await supabase
        .from("donations")
        .select("source_location, amount, status, currency")
        .eq("organization_id", orgId)
        .not("source_location", "is", null);
      if (error) throw error;

      const map: Record<string, BoxStats> = {};
      for (const row of (data ?? []) as DonationRow[]) {
        const key = row.source_location!;
        if (!map[key]) map[key] = { total: 0, confirmed: 0, count: 0, currency: row.currency };
        map[key].count++;
        map[key].total += Number(row.amount);
        if (row.status === "confirmed") map[key].confirmed += Number(row.amount);
      }
      return map;
    },
  });

  function addBox(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const limit = subscription.data?.plan?.max_qr_boxes;
    if (limit !== undefined && boxes.length >= limit) {
      toast.error(`Your plan allows ${limit} QR box${limit === 1 ? "" : "es"}. Upgrade to add more.`);
      return;
    }
    const next: Box[] = [
      ...boxes,
      {
        id: makeId(),
        name: name.trim(),
        location: location.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    setBoxes(next);
    saveBoxes(orgId, next);
    setName("");
    setLocation("");
    setOpen(false);
    toast.success("QR box created");
  }

  function deleteBox(id: string) {
    const next = boxes.filter((b) => b.id !== id);
    setBoxes(next);
    saveBoxes(orgId, next);
    toast.success("Box removed");
  }

  function giveUrl(box: Box) {
    return `${base}/give/${orgSlug}?loc=${encodeURIComponent(box.name)}`;
  }

  const stats = statsQuery.data ?? {};

  // Grand totals across all boxes
  const grandTotal = Object.values(stats).reduce((s, b) => s + b.total, 0);
  const grandConfirmed = Object.values(stats).reduce((s, b) => s + b.confirmed, 0);
  const grandCount = Object.values(stats).reduce((s, b) => s + b.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Donation Boxes"
        description={
          subscription.data?.plan?.max_qr_boxes !== undefined
            ? `${boxes.length} of ${subscription.data.plan.max_qr_boxes} boxes used — physical collection points with individual QR codes.`
            : "Physical collection points with individual QR codes. See exactly how much each location raises."
        }
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Add box
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-display">New donation box</DialogTitle>
              </DialogHeader>
              <form onSubmit={addBox} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="box-name">Box name *</Label>
                  <Input
                    id="box-name"
                    placeholder="e.g. Reception Desk, Sunday Service"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="box-loc">Location hint (optional)</Label>
                  <Input
                    id="box-loc"
                    placeholder="e.g. Ground floor lobby, near the lift"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={!name.trim()}>
                  Create box
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* How it works */}
      <div className="rounded-xl border border-border bg-muted/40 px-5 py-4">
        <p className="text-sm font-semibold">How it works</p>
        <ol className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">
          <li>
            <span className="font-medium text-foreground">1.</span> Create a box for each physical
            location — a collection tin, a table, a church door.
          </li>
          <li>
            <span className="font-medium text-foreground">2.</span> Print or download its QR code and
            place it at that spot. Donors scan it on their phone.
          </li>
          <li>
            <span className="font-medium text-foreground">3.</span> Every donation records which box it
            came from. See live totals per location right here.
          </li>
        </ol>
      </div>

      {/* Grand total summary — only when there are donations */}
      {grandCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatPill
            label="Total raised via boxes"
            value={formatMoney(grandTotal, orgCurrency)}
            sub={`${grandCount} donation${grandCount !== 1 ? "s" : ""}`}
          />
          <StatPill
            label="Confirmed"
            value={formatMoney(grandConfirmed, orgCurrency)}
          />
          <StatPill
            label="Active boxes"
            value={String(boxes.length)}
          />
        </div>
      )}

      {boxes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <QrCode className="size-10 text-muted-foreground/50" />
          <p className="font-medium">No QR boxes yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Create a box for each physical collection point — a tin, a table, a display stand — and
            know exactly how much each location raises.
          </p>
          <Button onClick={() => setOpen(true)} className="mt-2">
            <Plus className="size-4" /> Add your first box
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boxes.map((box) => {
            const s = stats[box.name];
            return (
              <Card key={box.id} className="shadow-card">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{box.name}</CardTitle>
                      {box.location && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" /> {box.location}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Active
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Per-box donation stats */}
                  {statsQuery.isLoading ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  ) : s ? (
                    <div className="grid grid-cols-2 gap-2">
                      <StatPill
                        label="Total raised"
                        value={formatMoney(s.total, s.currency)}
                        sub={`${s.count} gift${s.count !== 1 ? "s" : ""}`}
                      />
                      <StatPill
                        label="Confirmed"
                        value={formatMoney(s.confirmed, s.currency)}
                      />
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/40 py-3 text-center text-xs text-muted-foreground">
                      No donations yet — place the QR code and share
                    </p>
                  )}

                  {/* QR code */}
                  <div className="flex justify-center rounded-lg bg-white p-4">
                    <QRCode value={giveUrl(box)} size={120} level="M" />
                  </div>
                  <p className="break-all text-center text-[10px] text-muted-foreground">
                    {giveUrl(box)}
                  </p>

                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-1">
                          <Printer className="size-3.5" /> Print / Save
                        </Button>
                      </DialogTrigger>
                      <QrPrintDialog box={box} giveUrl={giveUrl(box)} />
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteBox(box.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
