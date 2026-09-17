import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Code2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Lock,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { canManageOrg } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useOrgData";
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { generateApiKey, revokeApiKey } from "@/lib/api-keys.functions";

export const Route = createFileRoute("/_authenticated/app/api")({
  head: () => ({
    meta: [{ title: "API — Givewell" }],
  }),
  component: ApiPage,
});

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
};

const BASE_URL = "https://your-deployment.com";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/donors",
    description: "List all donors (paginated)",
    params: "?limit=100&offset=0",
  },
  {
    method: "POST",
    path: "/api/v1/donors",
    description: "Create a new donor",
    body: `{ "first_name": "Jane", "last_name": "Smith", "email": "jane@example.com", "gift_aid_declaration": true }`,
  },
  {
    method: "GET",
    path: "/api/v1/donations",
    description: "List all donations (paginated)",
    params: "?limit=100&offset=0",
  },
  {
    method: "POST",
    path: "/api/v1/donations",
    description: "Record a donation",
    body: `{ "donor_id": "<uuid>", "amount": 25.00, "currency": "GBP", "payment_method": "card" }`,
  },
  {
    method: "GET",
    path: "/api/v1/campaigns",
    description: "List all fundraising campaigns",
    params: "?limit=50&offset=0",
  },
];

function PaidGate() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-lg">API access is a paid feature</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Connect Givewell to your CRM, fundraising platform, or custom
          applications. Available on the Pro plan and above.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <span>Sync donors automatically from any system</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <span>Record donations from your own payment flows</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <span>Pull reports into your BI tools</span>
        </div>
      </div>
      <Button asChild>
        <a href="/pricing">Upgrade to Pro →</a>
      </Button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <Copy className="size-3" />
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function NewKeyModal({
  orgId,
  onCreated,
  onClose,
}: {
  orgId: string;
  onCreated: (rawKey: string, name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await generateApiKey({ data: { orgId, name: name.trim() } });
      onCreated(result.rawKey, result.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Key name</Label>
            <Input
              id="key-name"
              placeholder="e.g. Salesforce integration"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
            />
            <p className="text-xs text-muted-foreground">
              A descriptive name to help you remember what this key is for.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={busy || !name.trim()}>
            {busy ? "Generating…" : "Generate key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealKeyModal({
  rawKey,
  name,
  onClose,
}: {
  rawKey: string;
  name: string;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(true);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            Your new API key
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Copy this key now. It will not be shown again.
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">{name}</p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 p-3">
              <code className="flex-1 break-all font-mono text-xs">
                {visible ? rawKey : rawKey.replace(/./g, "•")}
              </code>
              <button
                onClick={() => setVisible((v) => !v)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              <CopyButton text={rawKey} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pass this key in the{" "}
            <code className="rounded bg-muted px-1 py-0.5">Authorization</code> header:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              Bearer {rawKey.slice(0, 14)}…
            </code>
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiPage() {
  const { currentOrg, currentRole } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const qc = useQueryClient();
  const subscription = useSubscription(orgId);
  const canManage = canManageOrg(currentRole);

  const isPaid = !!subscription.data?.plan;

  const [showNew, setShowNew] = useState(false);
  const [revealKey, setRevealKey] = useState<{ rawKey: string; name: string } | null>(null);

  const keysQuery = useQuery({
    queryKey: ["api-keys", orgId],
    enabled: !!orgId && isPaid,
    queryFn: async (): Promise<ApiKeyRow[]> => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, last_used_at, created_at, is_active")
        .eq("organization_id", orgId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ApiKeyRow[];
    },
  });

  async function revoke(keyId: string, keyName: string) {
    if (!orgId) return;
    if (!confirm(`Revoke "${keyName}"? Any integrations using this key will stop working immediately.`))
      return;
    try {
      await revokeApiKey({ data: { keyId, orgId } });
      toast.success("API key revoked");
      void qc.invalidateQueries({ queryKey: ["api-keys", orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke key");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="API"
        description="Connect Givewell to your existing systems via the REST API."
        action={
          isPaid && canManage ? (
            <Button onClick={() => setShowNew(true)}>
              <Plus className="size-4" /> New API key
            </Button>
          ) : undefined
        }
      />

      {subscription.isLoading ? null : !isPaid ? (
        <PaidGate />
      ) : (
        <>
          {/* API Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="size-4" /> API keys
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(keysQuery.data ?? []).length === 0 && !keysQuery.isLoading ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Key className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No API keys yet</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Generate a key to start connecting external systems.
                  </p>
                  {canManage && (
                    <Button size="sm" onClick={() => setShowNew(true)}>
                      <Plus className="size-3.5" /> Create first key
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key prefix</TableHead>
                      <TableHead className="hidden sm:table-cell">Last used</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                      {canManage && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(keysQuery.data ?? []).map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                            {k.key_prefix}
                          </code>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {k.last_used_at ? formatDate(k.last_used_at) : "Never"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {formatDate(k.created_at)}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void revoke(k.id, k.name)}
                            >
                              <Trash2 className="size-3.5" />
                              <span className="sr-only">Revoke</span>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Documentation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="size-4" /> REST API reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Auth */}
              <div className="space-y-2">
                <p className="font-semibold text-sm">Authentication</p>
                <p className="text-sm text-muted-foreground">
                  Include your API key in every request as a{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">Bearer</code> token:
                </p>
                <div className="flex items-center rounded-lg border border-border bg-muted/60 p-3">
                  <code className="flex-1 text-xs font-mono">
                    Authorization: Bearer gw_your_key_here
                  </code>
                  <CopyButton text="Authorization: Bearer gw_your_key_here" />
                </div>
              </div>

              {/* Base URL */}
              <div className="space-y-2">
                <p className="font-semibold text-sm">Base URL</p>
                <div className="flex items-center rounded-lg border border-border bg-muted/60 p-3">
                  <code className="flex-1 text-xs font-mono">{BASE_URL}</code>
                  <CopyButton text={BASE_URL} />
                </div>
              </div>

              {/* Endpoints */}
              <div className="space-y-3">
                <p className="font-semibold text-sm">Endpoints</p>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {ENDPOINTS.map((ep, i) => (
                    <div key={i} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={ep.method === "GET" ? "secondary" : "default"}
                          className="font-mono text-xs"
                        >
                          {ep.method}
                        </Badge>
                        <code className="text-sm font-mono">{ep.path}</code>
                        <span className="text-sm text-muted-foreground">{ep.description}</span>
                      </div>
                      {"body" in ep ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Request body:</p>
                          <div className="flex items-start gap-2 rounded bg-muted/60 p-2">
                            <code className="flex-1 text-xs font-mono whitespace-pre-wrap">
                              {ep.body}
                            </code>
                            <CopyButton text={ep.body!} />
                          </div>
                        </div>
                      ) : ep.params ? (
                        <div className="flex items-center gap-1">
                          <code className="text-xs text-muted-foreground font-mono">
                            {ep.path}{ep.params}
                          </code>
                          <CopyButton text={`${BASE_URL}${ep.path}${ep.params}`} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Example */}
              <div className="space-y-2">
                <p className="font-semibold text-sm">Example (cURL)</p>
                <div className="relative rounded-lg border border-border bg-muted/60 p-3">
                  <pre className="text-xs font-mono overflow-x-auto whitespace-pre">{`curl -X GET "${BASE_URL}/api/v1/donors" \\
  -H "Authorization: Bearer gw_your_key_here" \\
  -H "Content-Type: application/json"`}</pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton text={`curl -X GET "${BASE_URL}/api/v1/donors" \\\n  -H "Authorization: Bearer gw_your_key_here" \\\n  -H "Content-Type: application/json"`} />
                  </div>
                </div>
              </div>

              {/* JavaScript */}
              <div className="space-y-2">
                <p className="font-semibold text-sm">Example (JavaScript)</p>
                <div className="relative rounded-lg border border-border bg-muted/60 p-3">
                  <pre className="text-xs font-mono overflow-x-auto whitespace-pre">{`const res = await fetch("${BASE_URL}/api/v1/donors", {
  headers: { "Authorization": "Bearer gw_your_key_here" }
});
const { data, pagination } = await res.json();`}</pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton text={`const res = await fetch("${BASE_URL}/api/v1/donors", {\n  headers: { "Authorization": "Bearer gw_your_key_here" }\n});\nconst { data, pagination } = await res.json();`} />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                All list endpoints return{" "}
                <code className="rounded bg-muted px-1 py-0.5">data</code> (array) and{" "}
                <code className="rounded bg-muted px-1 py-0.5">pagination</code>{" "}
                (total, limit, offset). Errors return{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{ \"error\": \"...\" }"}</code>.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modals */}
      {showNew && orgId && (
        <NewKeyModal
          orgId={orgId}
          onCreated={(rawKey, name) => {
            setShowNew(false);
            setRevealKey({ rawKey, name });
            void qc.invalidateQueries({ queryKey: ["api-keys", orgId] });
          }}
          onClose={() => setShowNew(false)}
        />
      )}

      {revealKey && (
        <RevealKeyModal
          rawKey={revealKey.rawKey}
          name={revealKey.name}
          onClose={() => setRevealKey(null)}
        />
      )}
    </div>
  );
}
