import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, Building2, ChevronDown, ChevronUp, CreditCard, Database, ExternalLink, FileText, Inbox, MessageCircle, Plus, RefreshCw, Server, Shield, Trash2, Users, X } from "lucide-react";
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
import { syncPlansToStripe, getAdminSubscriptions, processAdminRefund, cancelAdminSubscription, type AdminSubscription } from "@/lib/stripe.functions";

export const Route = createFileRoute("/_authenticated/app/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { mode: "login" as const } });
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
  const [syncing, setSyncing] = useState(false);

  async function handleSyncToStripe() {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast.error("Not signed in"); setSyncing(false); return; }
      const { results } = await syncPlansToStripe({ data: { token: session.access_token } });
      const created = results.filter((r) => !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;
      toast.success(
        created > 0
          ? `Stripe sync complete — ${created} plan${created !== 1 ? "s" : ""} created, ${skipped} already existed`
          : `All plans already exist in Stripe (${skipped} skipped)`
      );
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["public-plans"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stripe sync failed");
    } finally {
      setSyncing(false);
    }
  }

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

  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [planActionBusy, setPlanActionBusy] = useState<string | null>(null);

  async function togglePlanActive(plan: Plan) {
    setPlanActionBusy(plan.id);
    try {
      const { error } = await supabase.from("plans").update({ is_active: !plan.is_active } as never).eq("id", plan.id);
      if (error) throw error;
      toast.success(plan.is_active ? `"${plan.name}" paused — no longer available for new signups` : `"${plan.name}" activated`);
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["public-plans"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update plan");
    } finally {
      setPlanActionBusy(null);
    }
  }

  async function deletePlan(planId: string) {
    setPlanActionBusy(planId);
    try {
      // Check for active subscriptions on this plan first
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("plan_id", planId)
        .in("status", ["active", "trialing"]);
      if (activeSubs && activeSubs.length > 0) {
        toast.error(`Cannot delete: ${activeSubs.length} active subscription${activeSubs.length !== 1 ? "s" : ""} use this plan. Pause it instead.`);
        setConfirmDeletePlanId(null);
        return;
      }
      const { error } = await supabase.from("plans").delete().eq("id", planId);
      if (error) throw error;
      toast.success("Plan deleted — features and limits cleaned up automatically");
      setConfirmDeletePlanId(null);
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["public-plans"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete plan");
    } finally {
      setPlanActionBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pricing plans</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSyncToStripe} disabled={syncing}>
            <RefreshCw className={`mr-1.5 size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync to Stripe"}
          </Button>
          <Button size="sm" onClick={() => { setAdding(true); setNewPlan(BLANK_PLAN); }}>
            <Plus className="mr-1.5 size-4" /> New plan
          </Button>
        </div>
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
                  {plan.slug === "on-premise"
                    ? <Badge variant="outline" className="text-xs">Contact us</Badge>
                    : plan.price_monthly === 0
                      ? <Badge variant="outline" className="text-xs">Free</Badge>
                      : <Badge variant="outline" className="text-xs">£{plan.price_monthly}/mo</Badge>
                  }
                  {!plan.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  {!plan.is_public && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.max_members} members · {plan.max_donors.toLocaleString()} donors · {plan.max_campaigns} campaigns
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={planActionBusy === plan.id}
                  onClick={() => void togglePlanActive(plan)}
                  title={plan.is_active ? "Pause plan" : "Activate plan"}
                >
                  {plan.is_active ? "Pause" : "Activate"}
                </Button>
                {confirmDeletePlanId === plan.id ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={planActionBusy === plan.id}
                      onClick={() => void deletePlan(plan.id)}>
                      Confirm delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeletePlanId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={planActionBusy === plan.id}
                    onClick={() => setConfirmDeletePlanId(plan.id)}
                    title="Delete plan"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
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
        .from("chat_support_agents" as never)
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
      if (!profile) throw new Error("No user found with that email. They must register first.");
      const { error } = await supabase.from("chat_support_agents" as never).insert({ user_id: profile.id } as never);
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
    const { error } = await supabase.from("chat_support_agents" as never).delete().eq("user_id", userId);
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

function PaymentsSection() {
  const qc = useQueryClient();
  const [refundTarget, setRefundTarget] = useState<AdminSubscription | null>(null);
  const [refundAmountGbp, setRefundAmountGbp] = useState("");
  const [refundReason, setRefundReason] = useState<"duplicate" | "fraudulent" | "requested_by_customer">("requested_by_customer");
  const [refundCancelSub, setRefundCancelSub] = useState(true);
  const [refundBusy, setRefundBusy] = useState(false);

  const subsQuery = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      return getAdminSubscriptions({ data: { token: session.access_token } });
    },
  });

  async function handleRefund() {
    if (!refundTarget?.stripe_payment_intent_id) return;
    const amountPence = Math.round(parseFloat(refundAmountGbp) * 100);
    if (!amountPence || amountPence <= 0) { toast.error("Enter a valid refund amount"); return; }
    setRefundBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired");
      const result = await processAdminRefund({
        data: {
          token: session.access_token,
          paymentIntentId: refundTarget.stripe_payment_intent_id,
          amountPence,
          reason: refundReason,
        },
      });
      let cancelMsg = "";
      if (refundCancelSub && refundTarget.stripe_subscription_id) {
        await cancelAdminSubscription({
          data: { token: session.access_token, stripeSubscriptionId: refundTarget.stripe_subscription_id },
        });
        cancelMsg = " · Subscription cancelled.";
      }
      toast.success(`Refund of £${(result.amountPence / 100).toFixed(2)} issued — Stripe ID: ${result.refundId} (${result.status})${cancelMsg}`);
      setRefundTarget(null);
      setRefundAmountGbp("");
      void qc.invalidateQueries({ queryKey: ["admin-payments"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setRefundBusy(false);
    }
  }

  const subs = subsQuery.data?.subscriptions ?? [];
  const mismatches = subs.filter((s) => s.mismatch).length;

  const STATUS_COLOR: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    canceled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    unpaid: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    fetch_error: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  };

  function statusBadge(status: string | null) {
    if (!status) return <span className="text-xs text-muted-foreground">—</span>;
    const cls = STATUS_COLOR[status] ?? "bg-muted text-muted-foreground";
    return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{status.replace("_", " ")}</span>;
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total subscriptions</p>
            <p className="mt-2 font-display text-2xl font-bold">{subsQuery.isLoading ? "…" : subs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active</p>
            <p className="mt-2 font-display text-2xl font-bold text-green-600">
              {subsQuery.isLoading ? "…" : subs.filter((s) => s.stripe_status === "active" || (!s.stripe_status && s.status === "active")).length}
            </p>
          </CardContent>
        </Card>
        <Card className={mismatches > 0 ? "border-yellow-400" : ""}>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DB ↔ Stripe mismatches</p>
            <p className={`mt-2 font-display text-2xl font-bold ${mismatches > 0 ? "text-yellow-600" : ""}`}>
              {subsQuery.isLoading ? "…" : mismatches}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All subscriptions</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["admin-payments"] })} disabled={subsQuery.isFetching}>
            <RefreshCw className={`mr-1.5 size-4 ${subsQuery.isFetching ? "animate-spin" : ""}`} />
            {subsQuery.isFetching ? "Loading…" : "Refresh from Stripe"}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {subsQuery.isError && (
            <p className="p-6 text-sm text-destructive">{subsQuery.error instanceof Error ? subsQuery.error.message : "Could not load subscriptions"}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead className="hidden md:table-cell">Plan</TableHead>
                <TableHead>DB status</TableHead>
                <TableHead>Stripe status</TableHead>
                <TableHead className="hidden lg:table-cell">Billing</TableHead>
                <TableHead className="hidden lg:table-cell">Period ends</TableHead>
                <TableHead className="hidden xl:table-cell">Last paid</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id} className={s.mismatch ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}>
                  <TableCell className="font-medium">
                    {s.org_name}
                    {s.mismatch && <AlertTriangle className="ml-1 inline size-3.5 text-yellow-600" title="DB and Stripe statuses differ" />}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{s.plan_name}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {statusBadge(s.stripe_status)}
                      {s.stripe_subscription_id && (
                        <a
                          href={`https://dashboard.stripe.com/subscriptions/${s.stripe_subscription_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground/60 hover:text-muted-foreground"
                          title="Open in Stripe"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground capitalize lg:table-cell">
                    {s.billing_period ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                    {s.stripe_amount !== null
                      ? `${(s.stripe_currency ?? "gbp").toUpperCase()} ${(s.stripe_amount / 100).toFixed(2)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.stripe_payment_intent_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRefundTarget(s);
                          setRefundAmountGbp(s.stripe_amount ? (s.stripe_amount / 100).toFixed(2) : "");
                          setRefundReason("requested_by_customer");
                          setRefundCancelSub(true);
                        }}
                      >
                        Refund
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {subs.length === 0 && !subsQuery.isLoading && !subsQuery.isError && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No subscriptions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Refund dialog */}
      {refundTarget && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-medium text-sm">Issue refund — {refundTarget.org_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Stripe payment: <code className="font-mono">{refundTarget.stripe_payment_intent_id}</code>
                    {refundTarget.stripe_amount !== null && ` · Charged: £${(refundTarget.stripe_amount / 100).toFixed(2)}`}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-amount">Amount to refund (£)</Label>
                    <Input
                      id="refund-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={refundAmountGbp}
                      onChange={(e) => setRefundAmountGbp(e.target.value)}
                      placeholder="9.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-reason">Reason</Label>
                    <select
                      id="refund-reason"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value as typeof refundReason)}
                    >
                      <option value="requested_by_customer">Customer request</option>
                      <option value="duplicate">Duplicate payment</option>
                      <option value="fraudulent">Fraudulent</option>
                    </select>
                  </div>
                </div>
                {refundTarget.stripe_subscription_id && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={refundCancelSub} onCheckedChange={setRefundCancelSub} />
                    Also cancel subscription (stop future billing)
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="destructive" disabled={refundBusy || !refundAmountGbp} onClick={() => void handleRefund()}>
                    {refundBusy ? "Processing…" : `Refund £${refundAmountGbp || "0.00"}${refundCancelSub && refundTarget.stripe_subscription_id ? " + Cancel" : ""}`}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={refundBusy} onClick={() => { setRefundTarget(null); setRefundAmountGbp(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ── Feature List / User Stories Section ──────────────────────────────────────
type AdminFeature = { id: string; title: string; description: string | null; type: string; status: string; priority: string; sort_order: number; created_at: string };

const FEATURE_TYPES = ["feature", "user_story", "bug", "epic"];
const FEATURE_STATUSES = ["backlog", "in_progress", "done", "deferred"];

function FeaturesSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "feature", status: "backlog", priority: "normal" });
  const [savingNew, setSavingNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const query = useQuery({
    queryKey: ["admin-features"],
    queryFn: async (): Promise<AdminFeature[]> => {
      const { data, error } = await supabase
        .from("admin_features" as never)
        .select("id, title, description, type, status, priority, sort_order, created_at")
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminFeature[];
    },
  });

  async function create() {
    if (!form.title) { toast.error("Title required"); return; }
    setSavingNew(true);
    try {
      const { error } = await supabase.from("admin_features" as never).insert(form as never);
      if (error) throw error;
      toast.success("Feature added");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["admin-features"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not create"); }
    finally { setSavingNew(false); }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("admin_features" as never).update({ status } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["admin-features"] });
  }

  async function deleteFeature(id: string) {
    const { error } = await supabase.from("admin_features" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    void qc.invalidateQueries({ queryKey: ["admin-features"] });
  }

  const rows = (query.data ?? []).filter((r) => filterStatus === "all" || r.status === filterStatus);
  const counts = FEATURE_STATUSES.reduce<Record<string, number>>((acc, s) => { acc[s] = (query.data ?? []).filter((r) => r.status === s).length; return acc; }, {});
  const PRIORITY_COLOR: Record<string, string> = { low: "text-muted-foreground", normal: "text-foreground", high: "text-orange-600", critical: "text-red-600 font-semibold" };
  const TYPE_COLOR: Record<string, string> = { feature: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", user_story: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", bug: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", epic: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Feature List &amp; User Stories</CardTitle>
          <div className="flex items-center gap-2">
            <select className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All ({(query.data ?? []).length})</option>
              {FEATURE_STATUSES.map((s) => <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>)}
            </select>
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 size-4" /> Add</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="As a donor, I want to…" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                  {FEATURE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                  {["low","normal","high","critical"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button disabled={savingNew} onClick={() => void create()}>Add</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium text-sm">{f.title}</div>
                  {f.description && <div className="text-xs text-muted-foreground line-clamp-1">{f.description}</div>}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLOR[f.type] ?? "bg-muted text-muted-foreground"}`}>{f.type.replace("_"," ")}</span>
                </TableCell>
                <TableCell className={`hidden text-xs md:table-cell ${PRIORITY_COLOR[f.priority] ?? ""}`}>{f.priority}</TableCell>
                <TableCell>
                  <select className="h-7 rounded-md border border-input bg-background px-2 text-xs" value={f.status} onChange={(e) => void updateStatus(f.id, e.target.value)}>
                    {FEATURE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => void deleteFeature(f.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !query.isLoading && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No items. Add a feature or user story.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Application Monitoring Section ────────────────────────────────────────────
function MonitoringSection() {
  const query = useQuery({
    queryKey: ["admin-monitoring"],
    refetchInterval: 30000,
    queryFn: async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

      const [orgsRes, usersRes, donationsRes, subsRes, donationsTodayRes, signupsTodayRes, enquiriesRes] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("donations").select("amount").eq("status", "confirmed"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
        supabase.from("donations").select("amount").eq("status", "confirmed").gte("created_at", today),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", today),
        supabase.from("onboarding_enquiries").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      ]);

      const totalDonations = (donationsRes.data ?? []).reduce((s, d) => s + Number(d.amount), 0);
      const todayDonations = (donationsTodayRes.data ?? []).reduce((s, d) => s + Number(d.amount), 0);

      return {
        orgs: orgsRes.count ?? 0,
        users: usersRes.count ?? 0,
        activeSubs: subsRes.count ?? 0,
        totalDonations,
        todayDonations,
        signupsToday: signupsTodayRes.count ?? 0,
        enquiriesThisWeek: enquiriesRes.count ?? 0,
      };
    },
  });

  const d = query.data;

  const tiles = [
    { label: "Organisations", value: d?.orgs ?? "—", sub: "total" },
    { label: "Users", value: d?.users ?? "—", sub: "total" },
    { label: "Active subscriptions", value: d?.activeSubs ?? "—", sub: "SaaS" },
    { label: "Total donated", value: d ? `£${d.totalDonations.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—", sub: "confirmed" },
    { label: "Donated today", value: d ? `£${d.todayDonations.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—", sub: "last 24h" },
    { label: "Signups today", value: d?.signupsToday ?? "—", sub: "new users" },
    { label: "Enquiries (7d)", value: d?.enquiriesThisWeek ?? "—", sub: "marketing site" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Activity className="size-4" /> Application Monitoring</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Auto-refreshes every 30s</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-1.5 size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.label}</p>
              <p className="mt-1.5 text-2xl font-bold font-display">{String(t.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Last updated: {query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString("en-GB") : "—"} ·{" "}
          <a href="https://supabase.com/dashboard/project/zaexufclxmrpiuxogsjo" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Supabase dashboard <ExternalLink className="inline size-3" />
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

// ── SQL / Database Management Section ────────────────────────────────────────
function SQLSection() {
  const [sql, setSql] = useState("SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size\nFROM information_schema.tables\nWHERE table_schema = 'public'\nORDER BY pg_total_relation_size(quote_ident(table_name)) DESC\nLIMIT 20;");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runQuery() {
    if (!sql.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_run_select" as never, { query: sql } as never);
      if (rpcError) throw rpcError;
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      setResult({ columns, rows });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const QUICK = [
    { label: "Table sizes", sql: "SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size\nFROM information_schema.tables\nWHERE table_schema = 'public'\nORDER BY pg_total_relation_size(quote_ident(table_name)) DESC\nLIMIT 20;" },
    { label: "Row counts", sql: "SELECT relname AS table_name, n_live_tup AS row_count\nFROM pg_stat_user_tables\nORDER BY n_live_tup DESC;" },
    { label: "Recent migrations", sql: "SELECT version, statements[1] AS first_statement\nFROM supabase_migrations.schema_migrations\nORDER BY version DESC LIMIT 20;" },
    { label: "Active RLS policies", sql: "SELECT tablename, policyname, cmd, roles\nFROM pg_policies\nWHERE schemaname = 'public'\nORDER BY tablename;" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="size-4" /> SQL / Database Management</CardTitle>
        <p className="text-xs text-muted-foreground">Read-only SELECT queries only. Use the Supabase dashboard for writes.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q.label} size="sm" variant="outline" onClick={() => setSql(q.sql)}>
              {q.label}
            </Button>
          ))}
        </div>
        <Textarea
          className="font-mono text-xs"
          rows={5}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
        />
        <div className="flex justify-between items-center">
          <Button onClick={() => void runQuery()} disabled={running || !sql.trim()}>
            {running ? <><RefreshCw className="mr-1.5 size-4 animate-spin" /> Running…</> : "Run query"}
          </Button>
          <a href="https://supabase.com/dashboard/project/zaexufclxmrpiuxogsjo/editor" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline underline-offset-2 flex items-center gap-1">
            Full Supabase editor <ExternalLink className="size-3" />
          </a>
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive font-mono">{error}</div>
        )}
        {result && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  {result.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                    {result.columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 font-mono whitespace-nowrap">{String(row[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr><td colSpan={result.columns.length} className="px-3 py-4 text-center text-muted-foreground">No rows returned</td></tr>
                )}
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-xs text-muted-foreground border-t">{result.rows.length} row{result.rows.length !== 1 ? "s" : ""}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Partner Management Section ────────────────────────────────────────────────
type Partner = { id: string; name: string; email: string; company: string | null; status: string; partner_code: string; reward_type: string; reward_rate: number; total_referrals: number; total_earned: number; created_at: string };

function PartnersSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", reward_type: "credits", reward_rate: "0.10", reward_levels: "1" });
  const [savingNew, setSavingNew] = useState(false);

  const query = useQuery({
    queryKey: ["admin-partners"],
    queryFn: async (): Promise<Partner[]> => {
      const { data, error } = await supabase
        .from("partners" as never)
        .select("id, name, email, company, status, partner_code, reward_type, reward_rate, total_referrals, total_earned, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const referralsQuery = useQuery({
    queryKey: ["admin-referrals-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_referrals" as never)
        .select("partner_id, status, reward_amount")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as { partner_id: string; status: string; reward_amount: number }[];
      const byPartner: Record<string, { total: number; converted: number; pending: number }> = {};
      for (const r of rows) {
        if (!byPartner[r.partner_id]) byPartner[r.partner_id] = { total: 0, converted: 0, pending: 0 };
        byPartner[r.partner_id].total++;
        if (r.status === "converted") byPartner[r.partner_id].converted++;
        if (r.status === "pending") byPartner[r.partner_id].pending++;
      }
      return byPartner;
    },
  });

  async function createPartner() {
    if (!form.name || !form.email) { toast.error("Name and email are required"); return; }
    setSavingNew(true);
    try {
      const { error } = await supabase.from("partners" as never).insert({
        name: form.name, email: form.email,
        company: form.company || null,
        reward_type: form.reward_type,
        reward_rate: parseFloat(form.reward_rate),
        reward_levels: parseInt(form.reward_levels),
      } as never);
      if (error) throw error;
      toast.success("Partner created");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["admin-partners"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not create"); }
    finally { setSavingNew(false); }
  }

  async function toggleStatus(id: string, current: string) {
    const next = current === "active" ? "suspended" : "active";
    const { error } = await supabase.from("partners" as never).update({ status: next } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Partner ${next}`);
    void qc.invalidateQueries({ queryKey: ["admin-partners"] });
  }

  const partners = query.data ?? [];
  const refMap = referralsQuery.data ?? {};
  const totalPartners = partners.length;
  const activePartners = partners.filter((p) => p.status === "active").length;
  const totalEarned = partners.reduce((s, p) => s + Number(p.total_earned), 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Partners", value: totalPartners, sub: `${activePartners} active` },
          { label: "Total referrals", value: partners.reduce((s, p) => s + p.total_referrals, 0), sub: "all time" },
          { label: "Total earned", value: `£${totalEarned.toFixed(2)}`, sub: "credits + monetary" },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
              <p className="mt-2 font-display text-2xl font-bold">{String(t.value)}</p>
              <p className="text-xs text-muted-foreground">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="size-4" /> Partners</CardTitle>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 size-4" /> Add partner</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {adding && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="jane@partner.org" />
                </div>
                <div className="space-y-1.5">
                  <Label>Company (optional)</Label>
                  <Input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Reward type</Label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.reward_type} onChange={(e) => setForm((p) => ({ ...p, reward_type: e.target.value }))}>
                    <option value="credits">Service credits (default)</option>
                    <option value="monetary">Monetary (requires explicit config)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reward rate (e.g. 0.10 = 10%)</Label>
                  <Input type="number" step="0.01" min="0" max="1" value={form.reward_rate} onChange={(e) => setForm((p) => ({ ...p, reward_rate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Multi-level depth (1–3)</Label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.reward_levels} onChange={(e) => setForm((p) => ({ ...p, reward_levels: e.target.value }))}>
                    <option value="1">1 level</option>
                    <option value="2">2 levels</option>
                    <option value="3">3 levels</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                <Button disabled={savingNew} onClick={() => void createPartner()}>Create</Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead className="hidden md:table-cell">Code</TableHead>
                <TableHead className="hidden md:table-cell">Reward</TableHead>
                <TableHead>Referrals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => {
                const stats = refMap[p.id];
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{p.partner_code}</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      <div className="capitalize">{p.reward_type}</div>
                      <div className="text-muted-foreground">{(p.reward_rate * 100).toFixed(0)}%</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{stats?.total ?? p.total_referrals} total</div>
                      {stats && <div className="text-xs text-muted-foreground">{stats.converted} converted</div>}
                    </TableCell>
                    <TableCell><StatusChip status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => void toggleStatus(p.id, p.status)}>
                        {p.status === "active" ? "Suspend" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {partners.length === 0 && !query.isLoading && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No partners yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ── NL Commercial Management types ───────────────────────────────────────────
type NLCustomer = { id: string; name: string; status: string; primary_contact: { name?: string; email?: string } | null; created_at: string; notes: string | null };
type NLDeployment = { id: string; customer_id: string; deployment_model: string; status: string; hosting_provider: string | null; app_version: string | null; go_live_date: string | null; enabled_modules: string[]; created_at: string; customer_name?: string };
type NLLicence = { id: string; customer_id: string; licence_key: string | null; start_date: string; expiry_date: string; status: string; maintenance_status: string; enabled_modules: string[]; customer_name?: string };
type NLChangeRequest = { id: string; customer_id: string | null; cr_ref: string | null; title: string; status: string; priority: string; estimated_days: number | null; agreed_price: number | null; customer_name?: string; created_at: string };

const DEPLOYMENT_STATUSES = ["enquiry","assessment","quoted","contracted","authorised","provisioning","deployed","uat","live","suspended","retired"];
const CR_STATUSES = ["requested","under_review","quoted","approved","in_development","delivered","rejected","withdrawn"];
const LICENCE_STATUSES = ["active","grace","expired","revoked"];

function statusColor(status: string) {
  const map: Record<string, string> = {
    live: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    contracted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    quoted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    enquiry: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    grace: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    suspended: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    retired: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium capitalize ${statusColor(status)}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Enquiries Pipeline Section ────────────────────────────────────────────────
function EnquiriesSection() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["nl-enquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_enquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function saveEnquiry(id: string) {
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("onboarding_enquiries")
        .update({ status: editStatus, notes: editNotes })
        .eq("id", id);
      if (error) throw error;
      toast.success("Enquiry updated");
      setExpanded(null);
      void qc.invalidateQueries({ queryKey: ["nl-enquiries"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingId(null);
    }
  }

  const rows = query.data ?? [];
  const byStatus = {
    new: rows.filter((r) => r.status === "new").length,
    contacted: rows.filter((r) => r.status === "contacted").length,
    qualified: rows.filter((r) => r.status === "qualified").length,
    closed: rows.filter((r) => r.status === "closed").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Inbox className="size-4" /> Onboarding Enquiries</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["nl-enquiries"] })}>
            <RefreshCw className="mr-1.5 size-4" /> Refresh
          </Button>
        </div>
        <div className="flex gap-3 pt-1">
          {Object.entries(byStatus).map(([s, n]) => (
            <span key={s} className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{n}</span> {s}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Name / Email</TableHead>
              <TableHead className="hidden md:table-cell">Donors</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <>
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.organisation}</TableCell>
                  <TableCell className="text-sm">
                    <div>{r.name}</div>
                    <div className="text-muted-foreground text-xs">{r.email}</div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell capitalize">
                    {(r.donor_count ?? "—").replace(/_/g, " ")}
                  </TableCell>
                  <TableCell><StatusChip status={r.status} /></TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {new Date(r.created_at).toLocaleDateString("en-GB")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (expanded === r.id) { setExpanded(null); return; }
                      setExpanded(r.id);
                      setEditStatus(r.status);
                      setEditNotes(r.notes ?? "");
                    }}>
                      {expanded === r.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded === r.id && (
                  <TableRow key={`${r.id}-expand`}>
                    <TableCell colSpan={6} className="bg-muted/30 px-4 py-3">
                      {r.message && <p className="mb-3 text-sm text-muted-foreground italic">"{r.message}"</p>}
                      <div className="flex flex-wrap gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                          >
                            {["new","contacted","qualified","closed"].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-1">
                          <Label className="text-xs">Notes</Label>
                          <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes…" className="text-xs h-8" />
                        </div>
                        <div className="flex items-end gap-2">
                          <Button size="sm" disabled={savingId === r.id} onClick={() => void saveEnquiry(r.id)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>Cancel</Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            {rows.length === 0 && !query.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No enquiries yet. They appear here when visitors submit the marketing site form.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Customers Section ─────────────────────────────────────────────────────────
function CustomersSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const query = useQuery({
    queryKey: ["nl-customers"],
    queryFn: async (): Promise<NLCustomer[]> => {
      const { data, error } = await supabase
        .from("nl_customers" as never)
        .select("id, name, status, primary_contact, created_at, notes")
        .order("name");
      if (error) throw error;
      return (data ?? []) as NLCustomer[];
    },
  });

  async function createCustomer() {
    if (!newName) { toast.error("Name is required"); return; }
    setSavingNew(true);
    try {
      const { error } = await supabase.from("nl_customers" as never).insert({
        name: newName,
        primary_contact: newEmail ? { email: newEmail } : null,
      } as never);
      if (error) throw error;
      toast.success("Customer created");
      setAdding(false); setNewName(""); setNewEmail("");
      void qc.invalidateQueries({ queryKey: ["nl-customers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("nl_customers" as never).update({ status } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    void qc.invalidateQueries({ queryKey: ["nl-customers"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> Customers</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 size-4" /> Add customer</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Organisation name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="St. Mary's Church" />
              </div>
              <div className="space-y-1.5">
                <Label>Primary contact email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="contact@example.org" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button disabled={savingNew} onClick={() => void createCustomer()}>Create</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Primary contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Added</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {c.primary_contact?.email ?? c.primary_contact?.name ?? "—"}
                </TableCell>
                <TableCell><StatusChip status={c.status} /></TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {new Date(c.created_at).toLocaleDateString("en-GB")}
                </TableCell>
                <TableCell className="text-right">
                  <select
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    value={c.status}
                    onChange={(e) => void updateStatus(c.id, e.target.value)}
                  >
                    {["prospect","active","suspended","churned"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </TableCell>
              </TableRow>
            ))}
            {(query.data ?? []).length === 0 && !query.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No customers yet. Add one or convert an enquiry.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Deployments Section ───────────────────────────────────────────────────────
function DeploymentsSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ customer_id: "", deployment_model: "customer_hosted", status: "enquiry", hosting_provider: "", app_version: "" });
  const [savingNew, setSavingNew] = useState(false);

  const customersQ = useQuery({
    queryKey: ["nl-customers"],
    queryFn: async (): Promise<NLCustomer[]> => {
      const { data, error } = await supabase.from("nl_customers" as never).select("id, name, status, primary_contact, created_at, notes").order("name");
      if (error) throw error;
      return (data ?? []) as NLCustomer[];
    },
  });

  const query = useQuery({
    queryKey: ["nl-deployments"],
    queryFn: async (): Promise<NLDeployment[]> => {
      const { data, error } = await supabase
        .from("nl_deployments" as never)
        .select("id, customer_id, deployment_model, status, hosting_provider, app_version, go_live_date, enabled_modules, created_at, nl_customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: never) => ({ ...(r as NLDeployment), customer_name: (r as never as { nl_customers: { name: string } | null }).nl_customers?.name }));
    },
  });

  async function createDeployment() {
    if (!form.customer_id) { toast.error("Select a customer"); return; }
    setSavingNew(true);
    try {
      const { error } = await supabase.from("nl_deployments" as never).insert(form as never);
      if (error) throw error;
      toast.success("Deployment created");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["nl-deployments"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("nl_deployments" as never).update({ status } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    void qc.invalidateQueries({ queryKey: ["nl-deployments"] });
  }

  const customers = customersQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Server className="size-4" /> Deployments</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 size-4" /> New deployment</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.customer_id} onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}>
                  <option value="">Select customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.deployment_model} onChange={(e) => setForm((p) => ({ ...p, deployment_model: e.target.value }))}>
                  <option value="saas">SaaS</option>
                  <option value="customer_hosted">Customer-hosted</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  {DEPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Hosting provider</Label>
                <Input value={form.hosting_provider} onChange={(e) => setForm((p) => ({ ...p, hosting_provider: e.target.value }))} placeholder="e.g. AWS, on-site" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button disabled={savingNew} onClick={() => void createDeployment()}>Create</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Hosting</TableHead>
              <TableHead className="hidden lg:table-cell">Go-live</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.customer_name ?? d.customer_id.slice(0, 8)}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell capitalize">
                  {d.deployment_model.replace("_", " ")}
                </TableCell>
                <TableCell><StatusChip status={d.status} /></TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{d.hosting_provider ?? "—"}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {d.go_live_date ? new Date(d.go_live_date).toLocaleDateString("en-GB") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <select className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    value={d.status} onChange={(e) => void updateStatus(d.id, e.target.value)}>
                    {DEPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </TableCell>
              </TableRow>
            ))}
            {(query.data ?? []).length === 0 && !query.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No deployments yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Licences Section ──────────────────────────────────────────────────────────
function LicencesSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ customer_id: "", licence_key: "", start_date: "", expiry_date: "", status: "active" });
  const [savingNew, setSavingNew] = useState(false);

  const customersQ = useQuery({
    queryKey: ["nl-customers"],
    queryFn: async (): Promise<NLCustomer[]> => {
      const { data, error } = await supabase.from("nl_customers" as never).select("id, name, status, primary_contact, created_at, notes").order("name");
      if (error) throw error;
      return (data ?? []) as NLCustomer[];
    },
  });

  const query = useQuery({
    queryKey: ["nl-licences"],
    queryFn: async (): Promise<NLLicence[]> => {
      const { data, error } = await supabase
        .from("nl_licences" as never)
        .select("id, customer_id, licence_key, start_date, expiry_date, status, maintenance_status, enabled_modules, nl_customers(name)")
        .order("expiry_date");
      if (error) throw error;
      return (data ?? []).map((r: never) => ({ ...(r as NLLicence), customer_name: (r as never as { nl_customers: { name: string } | null }).nl_customers?.name }));
    },
  });

  async function createLicence() {
    if (!form.customer_id || !form.start_date || !form.expiry_date) { toast.error("Customer, start and expiry dates are required"); return; }
    setSavingNew(true);
    try {
      const grace = new Date(form.expiry_date);
      grace.setDate(grace.getDate() + 30);
      const { error } = await supabase.from("nl_licences" as never).insert({ ...form, grace_until: grace.toISOString().slice(0, 10) } as never);
      if (error) throw error;
      toast.success("Licence created");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["nl-licences"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSavingNew(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const customers = customersQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Shield className="size-4" /> Licences</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 size-4" /> Issue licence</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.customer_id} onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}>
                  <option value="">Select customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Licence key / ref</Label>
                <Input value={form.licence_key} onChange={(e) => setForm((p) => ({ ...p, licence_key: e.target.value }))} placeholder="KG-2025-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button disabled={savingNew} onClick={() => void createLicence()}>Issue</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Key</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Maintenance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data ?? []).map((l) => {
              const expiring = l.expiry_date <= today && l.status === "active";
              return (
                <TableRow key={l.id} className={expiring ? "bg-orange-50/50 dark:bg-orange-900/10" : ""}>
                  <TableCell className="font-medium">{l.customer_name ?? l.customer_id.slice(0, 8)}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{l.licence_key ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(l.expiry_date).toLocaleDateString("en-GB")}
                    {expiring && <AlertTriangle className="ml-1 inline size-3.5 text-orange-500" />}
                  </TableCell>
                  <TableCell><StatusChip status={l.status} /></TableCell>
                  <TableCell className="hidden lg:table-cell"><StatusChip status={l.maintenance_status} /></TableCell>
                </TableRow>
              );
            })}
            {(query.data ?? []).length === 0 && !query.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No licences yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Change Requests Section ───────────────────────────────────────────────────
function ChangeRequestsSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ customer_id: "", cr_ref: "", title: "", status: "requested", priority: "normal", description: "" });
  const [savingNew, setSavingNew] = useState(false);

  const customersQ = useQuery({
    queryKey: ["nl-customers"],
    queryFn: async (): Promise<NLCustomer[]> => {
      const { data, error } = await supabase.from("nl_customers" as never).select("id, name, status, primary_contact, created_at, notes").order("name");
      if (error) throw error;
      return (data ?? []) as NLCustomer[];
    },
  });

  const query = useQuery({
    queryKey: ["nl-crs"],
    queryFn: async (): Promise<NLChangeRequest[]> => {
      const { data, error } = await supabase
        .from("nl_change_requests" as never)
        .select("id, customer_id, cr_ref, title, status, priority, estimated_days, agreed_price, created_at, nl_customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: never) => ({ ...(r as NLChangeRequest), customer_name: (r as never as { nl_customers: { name: string } | null }).nl_customers?.name }));
    },
  });

  async function createCR() {
    if (!form.title) { toast.error("Title is required"); return; }
    setSavingNew(true);
    try {
      const { error } = await supabase.from("nl_change_requests" as never).insert(form as never);
      if (error) throw error;
      toast.success("Change request created");
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ["nl-crs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("nl_change_requests" as never).update({ status } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    void qc.invalidateQueries({ queryKey: ["nl-crs"] });
  }

  const customers = customersQ.data ?? [];
  const PRIORITY_COLOR: Record<string, string> = { low: "text-muted-foreground", normal: "text-foreground", high: "text-orange-600", critical: "text-red-600 font-semibold" };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Change Requests</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 size-4" /> New CR</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.customer_id} onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}>
                  <option value="">Platform-wide</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>CR Ref</Label>
                <Input value={form.cr_ref} onChange={(e) => setForm((p) => ({ ...p, cr_ref: e.target.value }))} placeholder="CR-2025-001" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Add Gift Aid reporting module" />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                  {["low","normal","high","critical"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  {CR_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button disabled={savingNew} onClick={() => void createCR()}>Create</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref / Title</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data ?? []).map((cr) => (
              <TableRow key={cr.id}>
                <TableCell>
                  <div className="font-medium text-sm">{cr.title}</div>
                  {cr.cr_ref && <div className="font-mono text-xs text-muted-foreground">{cr.cr_ref}</div>}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{cr.customer_name ?? "Platform-wide"}</TableCell>
                <TableCell className={`text-xs font-medium capitalize ${PRIORITY_COLOR[cr.priority] ?? ""}`}>{cr.priority}</TableCell>
                <TableCell><StatusChip status={cr.status} /></TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {new Date(cr.created_at).toLocaleDateString("en-GB")}
                </TableCell>
                <TableCell className="text-right">
                  <select className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    value={cr.status} onChange={(e) => void updateStatus(cr.id, e.target.value)}>
                    {CR_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </TableCell>
              </TableRow>
            ))}
            {(query.data ?? []).length === 0 && !query.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No change requests yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at, is_suspended")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      // Fetch active subscriptions with plan names
      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("organization_id, status, current_period_start, billing_period, plans(name)")
        .in("status", ["active", "trialing"]);

      const orgSubMap: Record<string, { plan_name: string; start: string | null }> = {};
      for (const sub of subsData ?? []) {
        const planName = (sub.plans as { name: string } | null)?.name ?? null;
        if (planName) orgSubMap[sub.organization_id] = { plan_name: planName, start: sub.current_period_start ?? null };
      }

      // Map user_id → org subscription via org memberships
      const ids = (profiles ?? []).map((p) => p.id);
      const { data: memberships } = ids.length > 0
        ? await supabase.from("organization_members").select("user_id, organization_id").in("user_id", ids)
        : { data: [] };

      const userSubMap: Record<string, { plan_name: string; start: string | null }> = {};
      for (const m of memberships ?? []) {
        const sub = orgSubMap[(m as { user_id: string; organization_id: string }).organization_id];
        if (sub) userSubMap[(m as { user_id: string; organization_id: string }).user_id] = sub;
      }

      return (profiles ?? []).map((p) => ({
        ...p,
        plan_name: userSubMap[p.id]?.plan_name ?? null,
        sub_start: userSubMap[p.id]?.start ?? null,
      })) as Array<{ id: string; email: string | null; full_name: string | null; created_at: string; is_suspended: boolean | null; plan_name: string | null; sub_start: string | null }>;
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [userActionBusy, setUserActionBusy] = useState<string | null>(null);
  const [orphanWarning, setOrphanWarning] = useState<{ userId: string; userName: string; orgs: Array<{ id: string; name: string }> } | null>(null);
  const [confirmCleanupOrgId, setConfirmCleanupOrgId] = useState<string | null>(null);
  const [orgCleanupBusy, setOrgCleanupBusy] = useState(false);

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

  async function deleteUser(userId: string, alsoSuspendOrgIds?: string[]) {
    setUserActionBusy(userId);
    try {
      if (alsoSuspendOrgIds?.length) {
        for (const orgId of alsoSuspendOrgIds) {
          await supabase.from("organizations").update({ status: "suspended" }).eq("id", orgId);
        }
      }
      const { error } = await supabase.rpc("admin_delete_user", { target_user_id: userId });
      if (error) throw error;
      toast.success(alsoSuspendOrgIds?.length ? "User deleted and orphan organisation(s) suspended" : "User deleted");
      setConfirmDeleteId(null);
      setOrphanWarning(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete user");
    } finally {
      setUserActionBusy(null);
    }
  }

  async function handleConfirmDelete(userId: string, userName: string) {
    setUserActionBusy(userId);
    try {
      const { data: memberships } = await supabase
        .from("org_members" as never)
        .select("org_id")
        .eq("user_id", userId);
      const lastMemberOrgs: Array<{ id: string; name: string }> = [];
      for (const m of (memberships ?? []) as Array<{ org_id: string }>) {
        const { count } = await supabase
          .from("org_members" as never)
          .select("*", { count: "exact", head: true })
          .eq("org_id", m.org_id);
        if ((count ?? 0) <= 1) {
          const { data: org } = await supabase.from("organizations").select("id, name").eq("id", m.org_id).maybeSingle();
          if (org) lastMemberOrgs.push({ id: org.id, name: org.name });
        }
      }
      setUserActionBusy(null);
      if (lastMemberOrgs.length > 0) {
        setOrphanWarning({ userId, userName, orgs: lastMemberOrgs });
        setConfirmDeleteId(null);
      } else {
        await deleteUser(userId);
      }
    } catch {
      setUserActionBusy(null);
      toast.error("Could not check organisation membership — please try again");
    }
  }

  async function deleteOrg(orgId: string) {
    setOrgCleanupBusy(true);
    try {
      const { error } = await supabase.rpc("admin_delete_org" as never, { target_org_id: orgId } as never);
      if (error) throw error;
      toast.success("Organisation permanently deleted");
      setConfirmCleanupOrgId(null);
      void qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Could not delete organisation");
    } finally {
      setOrgCleanupBusy(false);
    }
  }

  const adminsQuery = useQuery({
    queryKey: ["admin-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("user_id, created_at, is_protected, protected_email")
        .order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r) => r.user_id as string).filter(Boolean);
      const profileMap: Record<string, { email: string | null; full_name: string | null }> = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", ids);
        for (const p of profiles ?? []) profileMap[p.id] = { email: p.email ?? null, full_name: p.full_name ?? null };
      }
      return rows.map((r) => ({ ...r, profiles: r.user_id ? (profileMap[r.user_id as string] ?? null) : null }));
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
      if (!profile) throw new Error("No user found with that email. They must register first.");
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

  async function removeAdmin(userId: string, isProtected?: boolean) {
    if (isProtected) {
      toast.error("This is a protected Network Logic UK super-admin slot and cannot be removed.");
      return;
    }
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
                  <TableHead className="hidden lg:table-cell">Plan</TableHead>
                  <TableHead className="hidden xl:table-cell">Since</TableHead>
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
                      <TableCell className="hidden lg:table-cell">
                        {u.plan_name
                          ? <Badge variant="outline" className="text-xs">{u.plan_name}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                        {u.sub_start ? formatDate(u.sub_start) : "—"}
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
                                onClick={() => void handleConfirmDelete(u.id, u.full_name ?? u.email ?? "this user")}
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
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No users yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {orphanWarning && (
          <Card className="border-destructive">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-destructive">Orphan organisation warning</p>
                  <p className="text-sm text-muted-foreground">
                    <strong>{orphanWarning.userName}</strong> is the only member of{" "}
                    <strong>{orphanWarning.orgs.map((o) => o.name).join(", ")}</strong>.
                    Deleting this user will leave {orphanWarning.orgs.length === 1 ? "that organisation" : "those organisations"} with no members.
                  </p>
                  <p className="text-xs text-muted-foreground">Note: In production, use Suspend instead of Delete to preserve data.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={userActionBusy === orphanWarning.userId}
                      onClick={() => void deleteUser(orphanWarning.userId, orphanWarning.orgs.map((o) => o.id))}
                    >
                      Delete user + suspend {orphanWarning.orgs.length === 1 ? "org" : "orgs"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={userActionBusy === orphanWarning.userId}
                      onClick={() => void deleteUser(orphanWarning.userId)}
                    >
                      Delete user only
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOrphanWarning(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                      {confirmCleanupOrgId === org.org_id ? (
                        <div className="flex items-center justify-end gap-1">
                          <AlertTriangle className="size-4 text-destructive" />
                          <span className="text-xs text-destructive">Delete forever?</span>
                          <Button size="sm" variant="destructive" disabled={orgCleanupBusy}
                            onClick={() => void deleteOrg(org.org_id)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="ghost" disabled={orgCleanupBusy}
                            onClick={() => setConfirmCleanupOrgId(null)}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void toggleOrgStatus(org.org_id, org.status)}
                          >
                            {org.status === "active" ? "Suspend" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Cleanup organisation"
                            onClick={() => setConfirmCleanupOrgId(org.org_id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      )}
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
                  const isProtected = !!(a as any).is_protected;
                  const displayEmail = profile?.email ?? (a as any).protected_email ?? "—";
                  return (
                    <TableRow key={a.user_id ?? (a as any).protected_email}>
                      <TableCell className="font-medium">
                        {profile?.full_name ?? "—"}
                        {isProtected && (
                          <Badge variant="outline" className="ml-2 text-[10px] border-amber-500 text-amber-600">
                            Protected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {displayEmail}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatDate(a.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isProtected && a.user_id !== user?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeAdmin(String(a.user_id), isProtected)}
                          >
                            Remove
                          </Button>
                        )}
                        {isProtected && (
                          <span className="text-xs text-muted-foreground italic">Network Logic UK</span>
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

      {/* ── MODULE 2: MONITORING ──────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Application monitoring</h2>
          <p className="text-sm text-muted-foreground">Live platform health, usage stats and key metrics.</p>
        </div>
        <MonitoringSection />
      </div>

      {/* ── MODULE 3: BRANDING ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Branding</h2>
          <p className="text-sm text-muted-foreground">White-label name, logo, colours and email styling per customer.</p>
        </div>
        <PlatformSettingsSection />
      </div>

      {/* ── MODULE 4: PRICING & PLANS ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Pricing &amp; plans</h2>
          <p className="text-sm text-muted-foreground">Plans, limits and usage allowances you can change without a release.</p>
        </div>
        <PlansSection />
      </div>

      {/* ── MODULE 5: PAYMENTS ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Payments</h2>
          <p className="text-sm text-muted-foreground">All platform subscriptions — reconciled against Stripe in real time. Issue refunds from here.</p>
        </div>
        <PaymentsSection />
      </div>

      {/* ── MODULE 5: CHAT & SUPPORT ───────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Chat &amp; support</h2>
          <p className="text-sm text-muted-foreground">Manage support agents and assign incoming conversations.</p>
        </div>
        <ChatSupportSection />
      </div>

      {/* ── MODULE 6: FEATURE LIST / USER STORIES ─────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Feature list &amp; user stories</h2>
          <p className="text-sm text-muted-foreground">Track product features, epics, user stories and bugs across the backlog.</p>
        </div>
        <FeaturesSection />
      </div>

      {/* ── MODULE 7: SQL / DATABASE MANAGEMENT ───────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">SQL / database management</h2>
          <p className="text-sm text-muted-foreground">Run read-only SELECT queries against the live database for diagnostics and reporting.</p>
        </div>
        <SQLSection />
      </div>

      {/* ── MODULE 8: PARTNER MANAGEMENT ──────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Partner management</h2>
          <p className="text-sm text-muted-foreground">Affiliate partners, referral tracking, multi-level rewards (default: service credits).</p>
        </div>
        <PartnersSection />
      </div>

      {/* ── MODULE 9: ONBOARDING PIPELINE ─────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Onboarding enquiries</h2>
          <p className="text-sm text-muted-foreground">Leads from the marketing site — qualify, contact and convert to customers.</p>
        </div>
        <EnquiriesSection />
      </div>

      {/* ── MODULE 11: CUSTOMERS ───────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Customers</h2>
          <p className="text-sm text-muted-foreground">Customer organisations — both SaaS tenants and customer-hosted deployments.</p>
        </div>
        <CustomersSection />
      </div>

      {/* ── MODULE 12: DEPLOYMENTS ─────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Deployments</h2>
          <p className="text-sm text-muted-foreground">Track every live and in-flight deployment through its full lifecycle.</p>
        </div>
        <DeploymentsSection />
      </div>

      {/* ── MODULE 13: LICENCES ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Licences</h2>
          <p className="text-sm text-muted-foreground">Issue and track annual licences for customer-hosted deployments.</p>
        </div>
        <LicencesSection />
      </div>

      {/* ── MODULE 14: CHANGE REQUESTS ────────────────────────────── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-base font-semibold">Change requests</h2>
          <p className="text-sm text-muted-foreground">Customer-funded and platform enhancements — from request to delivery.</p>
        </div>
        <ChangeRequestsSection />
      </div>
    </div>
  );
}
