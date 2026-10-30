import { createFileRoute } from "@tanstack/react-router";
import { sendInviteEmail } from "@/lib/email.functions";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, UserMinus, Mail, MessageSquareShare } from "lucide-react";
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
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { FeatureGate, LimitBanner } from "@/components/app/PlanGate";
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({
    meta: [
      { title: "Team — Donorbook" },
      {
        name: "description",
        content: "Invite team members and manage roles for your charity.",
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
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const members = team.data?.members ?? [];
  const invitations = team.data?.invitations ?? [];
  const pending = invitations.filter(
    (i) => !i.accepted_at && new Date(i.expires_at) > new Date(),
  );

  // If the query succeeded but returned 0 members, the current user's membership
  // row is missing from organization_members for this org (data integrity gap).
  const membersMissing = !team.isLoading && !team.isError && members.length === 0;

  const planFeatures = usePlanFeatures();
  const planLimit = planFeatures.getLimit("max_members") ?? subscription.data?.plan?.max_members ?? 3;
  const atLimit = planFeatures.isLoaded
    ? planFeatures.isAtLimit("max_members", members.length)
    : members.length >= (planLimit ?? 3);

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
        .insert({ organization_id: orgId, email, role, invited_by: user?.id ?? null })
        .select("token")
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/invite/${data.token}`;
      void sendInviteEmail({
        data: {
          toEmail: email,
          orgName: currentOrg?.name ?? "your organisation",
          inviteLink: link,
          role,
        },
      }).catch(() => null);
      setGeneratedLink(link);
      try { await navigator.clipboard.writeText(link); } catch { /* silent */ }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  function closeInviteDialog() {
    setInviteOpen(false);
    setGeneratedLink(null);
    setEmail("");
    setRole("fundraiser");
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    toast.success("Member removed");
    refresh();
  }

  async function changeRole(memberId: string, newRole: OrgRole) {
    const { error } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated");
    refresh();
  }

  async function revokeInvite(inviteId: string) {
    const { error } = await supabase.from("invitations").delete().eq("id", inviteId);
    if (error) { toast.error(error.message); return; }
    toast.success("Invitation revoked");
    refresh();
  }

  async function copyInviteLink(token: string) {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  }

  return (
    <FeatureGate feature="team_management">
    <div className="space-y-6">
      <LimitBanner feature="max_members" current={members.length} label="team seats" />
      <PageHeader
        title="Team"
        description={team.isLoading ? "Loading…" : `${members.length}${planLimit != null ? ` of ${planLimit}` : ""} seats used`}
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
              {team.isError && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-destructive">
                    Could not load team members: {String((team.error as Error)?.message ?? "unknown error")}
                  </TableCell>
                </TableRow>
              )}
              {membersMissing && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No member records found for this charity. Your membership row may be missing —
                    contact support or check the database directly.
                  </TableCell>
                </TableRow>
              )}
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

      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!v) closeInviteDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {generatedLink ? "Invite link ready" : "Invite a team member"}
            </DialogTitle>
          </DialogHeader>

          {generatedLink ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Share this link with <span className="font-medium text-foreground">{email}</span> so they can join your charity.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={generatedLink} className="font-mono text-xs" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedLink).catch(() => null);
                    toast.success("Copied!");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <a
                  href={`mailto:${email}?subject=You've been invited to ${currentOrg?.name ?? "a charity"}&body=Hi%2C%0A%0AYou've been invited to join ${encodeURIComponent(currentOrg?.name ?? "our charity")} on Donorbook.%0A%0AClick this link to accept:%0A${encodeURIComponent(generatedLink)}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Mail className="size-4" /> Email
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`You've been invited to join ${currentOrg?.name ?? "our charity"} on Donorbook. Click to accept: ${generatedLink}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <MessageSquareShare className="size-4" /> WhatsApp
                </a>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeInviteDialog}>Done</Button>
                <Button onClick={() => { setGeneratedLink(null); setEmail(""); }}>Invite another</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </FeatureGate>
  );
}
