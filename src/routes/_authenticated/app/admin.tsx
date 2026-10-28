import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronUp, CreditCard, MessageCircle, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformSettingsQuery } from "@/hooks/usePlatformSettings";
import { DEFAULTS, type PlatformSettings } from "@/lib/platform-settings.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { mode: "signin" as const } });
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!adminRow) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Platform Admin — Donorbook" },
      { name: "description", content: "Platform administration for Donorbook." },
    ],
  }),
  component: AdminPage,
});

type OrgRow = {
  org_id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  plan_name: string | null;
  member_count: number;
  donation_total: number;
  created_at: string;
};

const SETTING_LABELS: Record<keyof PlatformSettings, string> = {
  app_name: "App name",
  app_tagline: "Tagline",
  app_url: "App URL",
  support_email: "Support email",
  from_email: "Sending email (noreply)",
  legal_email: "Legal email",
  company_name: "Legal company name",
  company_address: "Company address",
  platform_currency: "Default currency",
  demo_slug: "Demo org slug",
  stripe_publishable_key: "Stripe publishable key (pk_live_…)",
};

const STRIPE_KEYS: (keyof PlatformSettings)[] = ["stripe_publishable_key"];

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  max_members: number;
  max_donors: number;
  max_campaigns: number;
  features: string[];
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
};

const BLANK_PLAN: Omit<Plan, "id"> = {
  name: "", slug: "", description: "",
  price_monthly: 0, price_yearly: 0,
  max_members: 5, max_donors: 500, max_campaigns: 5,
  features: [], is_public: true, is_active: true, sort_order: 99,
  stripe_price_id_monthly: null, stripe_price_id_yearly: null,
};

function PlanForm({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
  saveLabel,
}: {
  value: Omit<Plan, "id">;
  onChange: (v: Omit<Plan, "id">) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
}) {
  const set = (k: keyof Omit<Plan, "id">, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Growth" />
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input value={value.slug} onChange={(e) => set("slug", e.target.value)} placeholder="growth" />
        </div>
        <div className="space-y-1.5">
          <Label>Monthly price (£)</Label>
          <Input type="number" min={0} value={value.price_monthly} onChange={(e) => set("price_monthly", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Yearly price (£)</Label>
          <Input type="number" min={0} value={value.price_yearly} onChange={(e) => set("price_yearly", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Stripe Price ID — monthly</Label>
          <Input value={value.stripe_price_id_monthly ?? ""} onChange={(e) => set("stripe_price_id_monthly", e.target.value || null)} placeholder="price_1ABC…" className="font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label>Stripe Price ID — yearly</Label>
          <Input value={value.stripe_price_id_yearly ?? ""} onChange={(e) => set("stripe_price_id_yearly", e.target.value || null)} placeholder="price_1XYZ…" className="font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label>Max members</Label>
          <Input type="number" min={1} value={value.max_members} onChange={(e) => set("max_members", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Max donors</Label>
          <Input type="number" min={1} value={value.max_donors} onChange={(e) => set("max_donors", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Max campaigns</Label>
          <Input type="number" min={1} value={value.max_campaigns} onChange={(e) => set("max_campaigns", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Sort order</Label>
          <Input type="number" min={0} value={value.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="For growing fundraising teams" />
      </div>
      <div className="space-y-1.5">
        <Label>Features (one per line)</Label>
        <Textarea
          rows={4}
          value={value.features.join("\n")}
          onChange={(e) => set("features", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          placeholder={"Donor records\nDonation tracking\nPublic giving page"}
        />
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value.is_public} onCheckedChange={(v) => set("is_public", v)} />
          Public (visible on pricing page)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value.is_active} onCheckedChange={(v) => set("is_active", v)} />
          Active
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={onSave} disabled={busy}>{saveLabel}</Button>
      </div>
    </div>
  );
}

function PlansSection() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Omit<Plan, "id">>(BLANK_PLAN);
  const [adding, setAdding] = useState(false);
  const [newPlan, setNewPlan] = useState<Omit<Plan, "id">>(BLANK_PLAN);
  const [busy, setBusy] = useState(false);

  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, features: Array.isArray(p.features) ? p.features as string[] : [], stripe_price_id_monthly: (p as never as Plan).stripe_price_id_monthly ?? null, stripe_price_id_yearly: (p as never as Plan).stripe_price_id_yearly ?? null }));
    },
  });

  function startEdit(plan: Plan) {
    setExpanded(plan.id);
    setEditing({ name: plan.name, slug: plan.slug, description: plan.description, price_monthly: plan.price_monthly, price_yearly: plan.price_yearly, max_members: plan.max_members, max_donors: plan.max_donors, max_campaigns: plan.max_campaigns, features: plan.features, is_public: plan.is_public, is_active: plan.is_active, sort_order: plan.sort_order, stripe_price_id_monthly: plan.stripe_price_id_monthly, stripe_price_id_yearly: plan.stripe_price_id_yearly });
  }

  async function savePlan(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from("plans").update({ ...editing, features: editing.features } as never).eq("id", id);
      if (error) throw error;
      toast.success("Plan saved");
      setExpanded(null);
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["public-plans"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setBusy(false);
    }
  }

  async function createPlan() {
    if (!newPlan.name || !newPlan.slug) { toast.error("Name and slug are required"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("plans").insert({ ...newPlan, features: newPlan.features } as never);
      if (error) throw error;
      toast.success("Plan created");
      setAdding(false);
      setNewPlan(BLANK_PLAN);
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["public-plans"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pricing plans</CardTitle>
        <Button size="sm" onClick={() => { setAdding(true); setNewPlan(BLANK_PLAN); }}>
          <Plus className="mr-1.5 size-4" /> New plan
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <PlanForm
            value={newPlan}
            onChange={setNewPlan}
            onSave={() => void createPlan()}
            onCancel={() => setAdding(false)}
            busy={busy}
            saveLabel="Create plan"
          />
        )}
        {(plansQuery.data ?? []).map((plan) => (
          <div key={plan.id} className="rounded-lg border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{plan.name}</span>
                  <Badge variant="outline" className="text-xs">£{plan.price_monthly}/mo</Badge>
                  {!plan.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  {!plan.is_public && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.max_members} members · {plan.max_donors.toLocaleString()} donors · {plan.max_campaigns} campaigns
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => expanded === plan.id ? setExpanded(null) : startEdit(plan)}
              >
                {expanded === plan.id
                  ? <><ChevronUp className="mr-1 size-4" />Close</>
                  : <><ChevronDown className="mr-1 size-4" />Edit</>
                }
              </Button>
            </div>
            {expanded === plan.id && (
              <div className="border-t px-4 pb-4 pt-3">
                <PlanForm
                  value={editing}
                  onChange={setEditing}
                  onSave={() => void savePlan(plan.id)}
                  onCancel={() => setExpanded(null)}
                  busy={busy}
                  saveLabel="Save plan"
                />
              </div>
            )}
          </div>
        ))}
        {(plansQuery.data ?? []).length === 0 && !plansQuery.isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">No plans yet. Click "New plan" to add one.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PlatformSettingsSection() {
  const { data: settings, refetch } = usePlatformSettingsQuery();
  const current = settings ?? DEFAULTS;
  const [editing, setEditing] = useState<Partial<PlatformSettings>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const entries = Object.entries(editing) as [keyof PlatformSettings, string][];
      for (const [key, value] of entries) {
        const { error } = await supabase
          .from("platform_settings")
          .upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
      toast.success("Platform settings saved");
      setEditing({});
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  const generalKeys = (Object.keys(DEFAULTS) as (keyof PlatformSettings)[]).filter((k) => !STRIPE_KEYS.includes(k));
  const hasChanges = Object.keys(editing).length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Platform settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {generalKeys.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`ps-${key}`}>{SETTING_LABELS[key]}</Label>
                <Input
                  id={`ps-${key}`}
                  value={editing[key] ?? current[key]}
                  onChange={(e) =>
                    setEditing((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          {hasChanges && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing({})} disabled={busy}>Discard</Button>
              <Button onClick={() => void save()} disabled={busy}>Save changes</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" /> Stripe configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Charity subscription payments go to your Stripe account. Enter your keys below.
            The <strong>secret key</strong> must also be added to Lovable environment variables as{" "}
            <code className="rounded bg-muted px-1 text-xs">STRIPE_SECRET_KEY</code> — never stored here.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ps-stripe_publishable_key">Stripe publishable key (pk_live_… or pk_test_…)</Label>
            <Input
              id="ps-stripe_publishable_key"
              value={editing.stripe_publishable_key ?? current.stripe_publishable_key}
              onChange={(e) => setEditing((prev) => ({ ...prev, stripe_publishable_key: e.target.value }))}
              placeholder="pk_live_…"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Safe to store — this key is public-facing.</p>
          </div>
          {hasChanges && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing({})} disabled={busy}>Discard</Button>
              <Button onClick={() => void save()} disabled={busy}>Save changes</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

type ConversationRow = {
  id: string;
  subject: string;
  status: "open" | "assigned" | "closed";
  created_at: string;
  org: { name: string } | null;
  started_by_profile: { full_name: string | null; email: string | null } | null;
  assigned_to_profile: { full_name: string | null; email: string | null } | null;
};

function ChatSupportSection() {
  const qc = useQueryClient();
  const [newAgentEmail, setNewAgentEmail] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);

  const agentsQuery = useQuery({
    queryKey: ["chat-support-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_support_agents")
        .select("user_id, created_at")
        .order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r) => r.user_id as string);
      const profileMap: Record<string, { email: string | null; full_name: string | null }> = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", ids);
        for (const p of profiles ?? []) profileMap[p.id] = { email: p.email ?? null, full_name: p.full_name ?? null };
      }
      return rows.map((r) => ({ ...r, profiles: profileMap[r.user_id as string] ?? null }));
    },
  });

  const conversationsQuery = useQuery({
    queryKey: ["admin-conversations"],
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from("support_conversations")
        .select(
          "id, subject, status, created_at, org:org_id(name), started_by_profile:started_by(full_name, email), assigned_to_profile:assigned_to(full_name, email)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationRow[];
    },
  });

  async function addAgent() {
    if (!newAgentEmail) return;
    setAgentBusy(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", newAgentEmail)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("No user found with that email. They must sign up first.");
      const { error } = await supabase.from("chat_support_agents").insert({ user_id: profile.id });
      if (error) throw error;
      toast.success("Chat support agent added");
      setNewAgentEmail("");
      void qc.invalidateQueries({ queryKey: ["chat-support-agents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add agent");
    } finally {
      setAgentBusy(false);
    }
  }

  async function removeAgent(userId: string) {
    const { error } = await supabase.from("chat_support_agents").delete().eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Agent removed");
    void qc.invalidateQueries({ queryKey: ["chat-support-agents"] });
  }

  async function assignConversation(convId: string, agentUserId: string) {
    const { error } = await supabase
      .from("support_conversations")
      .update({ assigned_to: agentUserId, status: "assigned" })
      .eq("id", convId);
    if (error) { toast.error(error.message); return; }
    toast.success("Conversation assigned");
    void qc.invalidateQueries({ queryKey: ["admin-conversations"] });
  }

  async function closeConversation(convId: string) {
    const { error } = await supabase
      .from("support_conversations")
      .update({ status: "closed" })
      .eq("id", convId);
    if (error) { toast.error(error.message); return; }
    toast.success("Conversation closed");
    void qc.invalidateQueries({ queryKey: ["admin-conversations"] });
  }

  const agents = agentsQuery.data ?? [];
  const convos = conversationsQuery.data ?? [];

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    open: "default",
    assigned: "outline",
    closed: "secondary",
  };

  return (
    <>
      {/* Chat support agents */}
      <Card>
        <CardHeader>
          <CardTitle>Chat support agents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => {
                const profile = a.profiles as unknown as { email: string | null; full_name: string | null } | null;
                return (
                  <TableRow key={a.user_id}>
                    <TableCell className="font-medium">{profile?.full_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{profile?.email ?? "—"}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {formatDate(a.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => void removeAgent(String(a.user_id))}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {agents.length === 0 && !agentsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No agents yet. Add one below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex gap-2 pt-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-agent">Add agent by email</Label>
              <Input
                id="new-agent"
                type="email"
                value={newAgentEmail}
                onChange={(e) => setNewAgentEmail(e.target.value)}
                placeholder="support@example.com"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => void addAgent()} disabled={agentBusy || !newAgentEmail}>
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversations list */}
      <Card>
        <CardHeader>
          <CardTitle>Support conversations</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden sm:table-cell">From</TableHead>
                <TableHead className="hidden md:table-cell">Organisation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Assigned to</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {convos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.subject}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {c.started_by_profile?.full_name ?? c.started_by_profile?.email ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {c.org?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"} className="capitalize">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {c.assigned_to_profile?.full_name ?? c.assigned_to_profile?.email ?? (
                      <span className="text-muted-foreground/60">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {formatDate(c.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.status !== "closed" && agents.length > 0 && (
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) void assignConversation(c.id, e.target.value);
                            e.target.value = "";
                          }}
                        >
                          <option value="" disabled>Assign…</option>
                          {agents.map((a) => {
                            const p = a.profiles as unknown as { email: string | null; full_name: string | null } | null;
                            return (
                              <option key={String(a.user_id)} value={String(a.user_id)}>
                                {p?.full_name ?? p?.email ?? String(a.user_id).slice(0, 8)}
                              </option>
                            );
                          })}
                        </select>
                      )}
                      {c.status !== "closed" && (
                        <Button size="sm" variant="ghost" onClick={() => void closeConversation(c.id)}>
                          Close
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {convos.length === 0 && !conversationsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No support conversations yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const orgsQuery = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: async (): Promise<OrgRow[]> => {
      const { data, error } = await supabase.rpc("admin_org_summary");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        org_id: String(r['org_id']),
        name: String(r['name']),
        slug: String(r['slug']),
        status: r['status'] as "active" | "suspended",
        plan_name: r['plan_name'] ? String(r['plan_name']) : null,
        member_count: Number(r['member_count']),
        donation_total: Number(r['donation_total']),
        created_at: String(r['created_at']),
      }));
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at, is_suspended")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [userActionBusy, setUserActionBusy] = useState<string | null>(null);

  async function toggleUserSuspended(userId: string, suspended: boolean) {
    setUserActionBusy(userId);
    try {
      const { error } = await supabase.rpc("admin_set_user_suspended", {
        target_user_id: userId,
        suspended,
      });
      if (error) throw error;
      toast.success(suspended ? "User suspended" : "User activated");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update user");
    } finally {
      setUserActionBusy(null);
    }
  }

  async function deleteUser(userId: string) {
    setUserActionBusy(userId);
    try {
      const { error } = await supabase.rpc("admin_delete_user", {
        target_user_id: userId,
      });
      if (error) throw error;
      toast.success("User deleted");
      setConfirmDeleteId(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete user");
    } finally {
      setUserActionBusy(null);
    }
  }

  const adminsQuery = useQuery({
    queryKey: ["admin-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("user_id, created_at")
        .order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r) => r.user_id as string);
      const profileMap: Record<string, { email: string | null; full_name: string | null }> = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", ids);
        for (const p of profiles ?? []) profileMap[p.id] = { email: p.email ?? null, full_name: p.full_name ?? null };
      }
      return rows.map((r) => ({ ...r, profiles: profileMap[r.user_id as string] ?? null }));
    },
  });

  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orgsRes, usersRes, donationsRes] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("donations").select("amount").eq("status", "confirmed"),
      ]);
      const total = (donationsRes.data ?? []).reduce((s, d) => s + Number(d.amount), 0);
      return {
        orgs: orgsRes.count ?? 0,
        users: usersRes.count ?? 0,
        donations: total,
      };
    },
  });

  async function toggleOrgStatus(orgId: string, current: "active" | "suspended") {
    const next = current === "active" ? "suspended" : "active";
    const { error } = await supabase
      .from("organizations")
      .update({ status: next })
      .eq("id", orgId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Org ${next}`);
    void qc.invalidateQueries({ queryKey: ["admin-orgs"] });
  }

  async function addAdmin() {
    if (!newAdminEmail) return;
    setBusy(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", newAdminEmail)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("No user found with that email. They must sign up first.");
      const { error } = await supabase
        .from("platform_admins")
        .insert({ user_id: profile.id });
      if (error) throw error;
      toast.success("Platform admin added");
      setNewAdminEmail("");
      void qc.invalidateQueries({ queryKey: ["admin-list"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add admin");
    } finally {
      setBusy(false);
    }
  }

  async function removeAdmin(userId: string) {
    if (userId === user?.id) {
      toast.error("You cannot remove yourself as an admin");
      return;
    }
    const { error } = await supabase.from("platform_admins").delete().eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Admin removed");
    void qc.invalidateQueries({ queryKey: ["admin-list"] });
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-8">
      <PageHeader title="Platform Admin" description="Donorbook platform management." />

      {/* Platform-wide stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Organisations", value: stats?.orgs ?? "—" },
          { label: "Users", value: stats?.users ?? "—" },
          { label: "Total donated", value: stats ? formatMoney(stats.donations) : "—" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-2 font-display text-2xl font-bold">{String(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── MODULE 1: USERS & ACCOUNTS ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Users &amp; accounts</h2>
          <p className="text-sm text-muted-foreground">See, suspend and support every organisation and user.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All users</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQuery.data ?? []).map((u) => {
                  const isSelf = u.id === user?.id;
                  const busy = userActionBusy === u.id;
                  const confirming = confirmDeleteId === u.id;
                  return (
                    <TableRow key={u.id} className={u.is_suspended ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        {u.full_name ?? <span className="text-muted-foreground">—</span>}
                        {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_suspended ? "secondary" : "default"}>
                          {u.is_suspended ? "Suspended" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isSelf && (
                          confirming ? (
                            <div className="flex items-center justify-end gap-1">
                              <AlertTriangle className="size-4 text-destructive" />
                              <span className="text-xs text-destructive">Delete?</span>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                                onClick={() => void deleteUser(u.id)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void toggleUserSuspended(u.id, !u.is_suspended)}
                              >
                                {u.is_suspended ? "Activate" : "Suspend"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => setConfirmDeleteId(u.id)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(usersQuery.data ?? []).length === 0 && !usersQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No users yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All organisations</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Plan</TableHead>
                  <TableHead className="hidden sm:table-cell">Members</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgsQuery.data ?? []).map((org) => (
                  <TableRow key={org.org_id}>
                    <TableCell>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-xs text-muted-foreground">/give/{org.slug}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {org.plan_name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{org.member_count}</TableCell>
                    <TableCell className="font-semibold">
                      {formatMoney(org.donation_total)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDate(org.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.status === "active" ? "default" : "secondary"}>
                        {org.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleOrgStatus(org.org_id, org.status)}
                      >
                        {org.status === "active" ? "Suspend" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {orgsQuery.isError && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-destructive">
                      Error: {orgsQuery.error instanceof Error ? orgsQuery.error.message : "Could not load organisations"}
                    </TableCell>
                  </TableRow>
                )}
                {(orgsQuery.data ?? []).length === 0 && !orgsQuery.isLoading && !orgsQuery.isError && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No organisations yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform admins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Added</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(adminsQuery.data ?? []).map((a) => {
                  const profile = a.profiles as unknown as { email: string | null; full_name: string | null } | null;
                  return (
                    <TableRow key={a.user_id}>
                      <TableCell className="font-medium">{profile?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {profile?.email ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatDate(a.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.user_id !== user?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeAdmin(String(a.user_id))}
                          >
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex gap-2 pt-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="new-admin">Add admin by email</Label>
                <Input
                  id="new-admin"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void addAdmin()} disabled={busy || !newAdminEmail}>
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── MODULE 2: BRANDING ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Branding</h2>
          <p className="text-sm text-muted-foreground">White-label name, logo, colours and email styling per customer.</p>
        </div>
        <PlatformSettingsSection />
      </div>

      {/* ── MODULE 3: PRICING & PLANS ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Pricing &amp; plans</h2>
          <p className="text-sm text-muted-foreground">Plans, limits and usage allowances you can change without a release.</p>
        </div>
        <PlansSection />
      </div>

      {/* ── MODULE 4: PAYMENTS ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Payments</h2>
          <p className="text-sm text-muted-foreground">Take payment through Stripe and see subscriptions and invoices.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CreditCard className="size-8 text-muted-foreground/50" />
            <div>
              <p className="font-medium">Stripe integration not yet connected</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Add your Stripe secret key and webhook secret to enable subscription management,
                invoice history, and payment analytics.
              </p>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </CardContent>
        </Card>
      </div>

      {/* ── MODULE 5: CHAT & SUPPORT ───────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Chat &amp; support</h2>
          <p className="text-sm text-muted-foreground">Manage support agents and assign incoming conversations.</p>
        </div>
        <ChatSupportSection />
      </div>
    </div>
  );
}
