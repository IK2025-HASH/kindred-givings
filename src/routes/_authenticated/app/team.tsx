import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, UserMinus } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { canManageOrg, useAuth, type OrgRole } from "@/hooks/useAuth";
import { useSubscription, useTeam } from "@/hooks/useOrgData";
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({
    meta: [
      { title: "Team — Givewell workspace" },
      {
        name: "description",
        content: "Invite team members and manage roles for your charity workspace.",
      },
    ],
  }),
  component: TeamPage,
});

const ROLES: OrgRole[] = ["admin", "fundraiser", "viewer"];
const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin — manage team and settings",
  fundraiser: "Fundraiser — record donations",
  viewer: "Viewer — read-only access",
};

function TeamPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const team = useTeam(orgId);
  const subscription = useSubscription(orgId);
  const qc = useQueryClient();
  const canManage = canManageOrg(currentRole);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("fundraiser");
  const [busy, setBusy] = useState(false);

  const members = team.data?.members ?? [];
  const invitations = team.data?.invitations ?? [];
  const pending = invitations.filter(
    (i) => !i.accepted_at && new Date(i.expires_at) > new Date(),
  );

  const planLimit = subscription.data?.plan?.max_members ?? 3;
  const atLimit = members.length >= planLimit;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["team", orgId] });
  }

  async function sendInvite() {
    if (!orgId || !email) return;
    if (atLimit) {
      toast.error(`Your plan allows ${planLimit} team members. Upgrade to invite more.`);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("invitations")
        .insert({ organization_id: orgId, email, role, invited_by: user?.id })
        .select("token")
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/invite/${data.token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied to clipboard");
      setEmail("");
      setInviteOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    refresh();
  }

  async function changeRole(memberId: string, newRole: OrgRole) {
    const { error } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    refresh();
  }

  async function revokeInvite(inviteId: string) {
    const { error } = await supabase.from("invitations").delete().eq("id", inviteId);
    if (error) return toast.error(error.message);
    toast.success("Invitation revoked");
    refresh();
  }

  async function copyInviteLink(token: string) {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description={`${members.length} of ${planLimit} seats used.`}
        action={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)} disabled={atLimit}>
              {atLimit ? `Seat limit reached (${planLimit})` : "Invite member"}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.profiles?.full_name ?? "—"}
                    {m.user_id === user?.id && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        You
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {m.profiles?.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {canManage && m.user_id !== user?.id && m.role !== "owner" ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => void changeRole(m.id, v as OrgRole)}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize text-xs">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="capitalize">
                        {m.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatDate(m.created_at)}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {m.user_id !== user?.id && m.role !== "owner" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void removeMember(m.id)}
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending invitations
          </h2>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell">Expires</TableHead>
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {inv.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatDate(inv.expires_at)}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {inv.token && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void copyInviteLink(inv.token!)}
                                title="Copy invite link"
                              >
                                <Copy className="size-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void revokeInvite(inv.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={sendInvite} disabled={busy || !email}>
              {busy ? "Creating…" : "Create invite link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
