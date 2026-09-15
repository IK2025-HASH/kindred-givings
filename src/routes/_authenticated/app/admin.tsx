import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDate, formatMoney } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!adminRow) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Platform Admin — Givewell" },
      { name: "description", content: "Platform administration for Givewell." },
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
      return (data ?? []).map((r: Record<string, unknown>) => ({
        org_id: String(r.org_id),
        name: String(r.name),
        slug: String(r.slug),
        status: r.status as "active" | "suspended",
        plan_name: r.plan_name ? String(r.plan_name) : null,
        member_count: Number(r.member_count),
        donation_total: Number(r.donation_total),
        created_at: String(r.created_at),
      }));
    },
  });

  const adminsQuery = useQuery({
    queryKey: ["admin-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("user_id, created_at, profiles:user_id(email, full_name)")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orgsRes, usersRes, donationsRes] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("donations")
          .select("amount")
          .eq("status", "confirmed"),
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
      .update({ status: next } as never)
      .eq("id", orgId);
    if (error) return toast.error(error.message);
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
    if (error) return toast.error(error.message);
    toast.success("Admin removed");
    void qc.invalidateQueries({ queryKey: ["admin-list"] });
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform Admin" description="Givewell platform management." />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Charities", value: stats?.orgs ?? "—" },
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

      <Card>
        <CardHeader>
          <CardTitle>All charities</CardTitle>
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
              {(orgsQuery.data ?? []).length === 0 && !orgsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No charities yet.
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
  );
}
