import { createFileRoute } from "@tanstack/react-router";
import QRCode from "react-qr-code";
import { useState, useRef } from "react";
import { Download, MapPin, Plus, Printer, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";

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
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR — ${box.name}</title>
        <style>
          body { margin: 0; display: flex; flex-direction: column; align-items: center;
                 justify-content: center; min-height: 100vh; font-family: system-ui; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          p  { font-size: 13px; color: #555; margin-bottom: 20px; }
          svg { width: 220px; height: 220px; }
          .url { margin-top: 14px; font-size: 11px; color: #888; word-break: break-all; max-width: 220px; text-align: center; }
        </style>
      </head>
      <body>
        <h1>${box.name}</h1>
        ${box.location ? `<p>${box.location}</p>` : ""}
        ${svg.outerHTML}
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

function QrBoxesPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";
  const orgSlug = currentOrg?.slug ?? "";
  const base = typeof window !== "undefined" ? window.location.origin : "";

  const [boxes, setBoxes] = useState<Box[]>(() => loadBoxes(orgId));
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [open, setOpen] = useState(false);

  function addBox(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const next = [
      ...boxes,
      { id: makeId(), name: name.trim(), location: location.trim(), createdAt: new Date().toISOString() },
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

  return (
    <AppShell>
      <PageHeader
        title="QR Donation Boxes"
        description="Generate a QR code for each physical collection point. Donors scan it and land straight on your giving page."
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
                    placeholder="e.g. Reception Desk, Main Entrance"
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

      {/* How it works strip */}
      <div className="rounded-xl border border-border bg-muted/40 px-5 py-4">
        <p className="text-sm font-semibold">How it works</p>
        <ol className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">
          <li><span className="font-medium text-foreground">1.</span> Create a box for each physical location — a collection tin, a table, a church door.</li>
          <li><span className="font-medium text-foreground">2.</span> Print or download the QR code and place it at that spot.</li>
          <li><span className="font-medium text-foreground">3.</span> Donors scan it and land on your giving page tagged with that location.</li>
        </ol>
      </div>

      {boxes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <QrCode className="size-10 text-muted-foreground/50" />
          <p className="font-medium">No QR boxes yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Create your first box for a physical donation collection point — a tin, a table, a display stand.
          </p>
          <Button onClick={() => setOpen(true)} className="mt-2">
            <Plus className="size-4" /> Add your first box
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boxes.map((box) => (
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
                  <Badge variant="secondary" className="shrink-0 text-[10px]">Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-center rounded-lg bg-white p-4">
                  <QRCode value={giveUrl(box)} size={120} level="M" />
                </div>
                <p className="break-all text-center text-[10px] text-muted-foreground">{giveUrl(box)}</p>
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
          ))}
        </div>
      )}
    </AppShell>
  );
}
