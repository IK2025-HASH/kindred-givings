import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/site/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Accept invitation — Givewell" },
      { name: "description", content: "Accept your invitation to join a charity workspace on Givewell." },
    ],
  }),
  component: InvitePage,
});

type InviteState =
  | { status: "loading" }
  | { status: "invalid"; reason: string }
  | { status: "ready"; orgName: string; role: string }
  | { status: "accepted"; orgName: string };

function InvitePage() {
  const { token } = Route.useParams();
  const { user, loading: authLoading, refreshMemberships, setCurrentOrgId } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  // Look up invitation details (org name, role) without accepting yet
  useEffect(() => {
    if (authLoading) return;
    void (async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("email, role, accepted_at, expires_at, organizations(name)")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        setState({ status: "invalid", reason: "This invitation link is not valid." });
        return;
      }
      if (data.accepted_at) {
        setState({ status: "invalid", reason: "This invitation has already been accepted." });
        return;
      }
      if (new Date(data.expires_at) < new Date()) {
        setState({ status: "invalid", reason: "This invitation has expired." });
        return;
      }

      const orgName =
        (data.organizations as unknown as { name: string } | null)?.name ?? "the charity";
      setState({ status: "ready", orgName, role: data.role });
    })();
  }, [token, authLoading]);

  async function accept() {
    if (!user) {
      // Store token in sessionStorage so we can come back after sign-in
      sessionStorage.setItem("pendingInvite", token);
      void navigate({ to: "/auth", search: { mode: "signup" } });
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
      if (error) throw error;
      const result = data as { error?: string; ok?: boolean; organization_id?: string };
      if (result.error) throw new Error(result.error);

      if (result.organization_id) setCurrentOrgId(result.organization_id);
      refreshMemberships();

      const orgName = state.status === "ready" ? state.orgName : "the charity";
      setState({ status: "accepted", orgName });
      toast.success(`You've joined ${orgName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept the invitation");
    } finally {
      setBusy(false);
    }
  }

  // After sign-in, auto-accept a pending invite
  useEffect(() => {
    if (!user || authLoading) return;
    const pending = sessionStorage.getItem("pendingInvite");
    if (pending === token && state.status === "ready") {
      sessionStorage.removeItem("pendingInvite");
      void accept();
    }
  }, [user, authLoading, state.status]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="mb-8">
        <Link to="/">
          <Logo />
        </Link>
      </div>

      <Card className="w-full max-w-md shadow-card">
        {state.status === "loading" && (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Checking invitation…
          </CardContent>
        )}

        {state.status === "invalid" && (
          <CardContent className="py-12 text-center space-y-3">
            <p className="font-semibold text-foreground">{state.reason}</p>
            <p className="text-sm text-muted-foreground">
              Ask the person who invited you to send a fresh link.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/">Go to Givewell</Link>
            </Button>
          </CardContent>
        )}

        {state.status === "ready" && (
          <>
            <CardHeader>
              <CardTitle className="font-display text-2xl">You've been invited</CardTitle>
              <p className="text-sm text-muted-foreground">
                Join <strong>{state.orgName}</strong> as a{" "}
                <span className="capitalize font-medium">{state.role}</span>.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!user && (
                <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
                  You'll need to sign in or create an account to accept this invitation.
                </p>
              )}
              <Button className="w-full" onClick={() => void accept()} disabled={busy}>
                {busy
                  ? "Accepting…"
                  : user
                    ? `Accept and join ${state.orgName}`
                    : "Sign in to accept"}
              </Button>
            </CardContent>
          </>
        )}

        {state.status === "accepted" && (
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h2 className="font-display text-xl font-bold">You're in</h2>
            <p className="text-sm text-muted-foreground">
              You've joined <strong>{state.orgName}</strong>.
            </p>
            <Button asChild>
              <Link to="/app">Go to dashboard</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
