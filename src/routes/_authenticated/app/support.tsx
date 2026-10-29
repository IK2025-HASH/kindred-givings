import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/support")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { mode: "login" as const } });
    // Allow platform admins and chat support agents
    const [adminRow, agentRow] = await Promise.all([
      supabase.from("platform_admins").select("user_id").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("chat_support_agents").select("user_id").eq("user_id", data.user.id).maybeSingle(),
    ]);
    if (!adminRow.data && !agentRow.data) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Support inbox — Donorbook" },
      { name: "description", content: "Support conversation inbox for chat support agents." },
    ],
  }),
  component: SupportPage,
});

type Conversation = {
  id: string;
  subject: string;
  status: "open" | "assigned" | "closed";
  created_at: string;
  org: { name: string } | null;
  started_by_profile: { full_name: string | null; email: string | null } | null;
};

type Message = {
  id: string;
  body: string;
  sender_name: string | null;
  sender_id: string | null;
  created_at: string;
};

function SupportPage() {
  const { user, isPlatformAdmin } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const convosQuery = useQuery({
    queryKey: ["support-inbox", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Conversation[]> => {
      const q = supabase
        .from("support_conversations")
        .select(
          "id, subject, status, created_at, org:org_id(name), started_by_profile:started_by(full_name, email)",
        )
        .neq("status", "closed")
        .order("created_at", { ascending: false });

      if (!isPlatformAdmin) {
        q.eq("assigned_to", user!.id);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["support-messages", selected?.id],
    enabled: !!selected,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, body, sender_name, sender_id, created_at")
        .eq("conversation_id", selected!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Message[];
    },
  });

  async function sendReply() {
    if (!selected || !reply.trim() || !user) return;
    setBusy(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const { error } = await supabase.from("support_messages").insert({
        conversation_id: selected.id,
        sender_id: user.id,
        sender_name: profile?.full_name ?? profile?.email ?? "Support agent",
        body: reply.trim(),
      });
      if (error) throw error;
      setReply("");
      void qc.invalidateQueries({ queryKey: ["support-messages", selected.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setBusy(false);
    }
  }

  async function closeConversation(convId: string) {
    const { error } = await supabase
      .from("support_conversations")
      .update({ status: "closed" })
      .eq("id", convId);
    if (error) { toast.error(error.message); return; }
    toast.success("Conversation closed");
    setSelected(null);
    void qc.invalidateQueries({ queryKey: ["support-inbox", user?.id] });
  }

  const convos = convosQuery.data ?? [];

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    open: "default",
    assigned: "outline",
    closed: "secondary",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support inbox"
        description={`${convos.length} open conversation${convos.length !== 1 ? "s" : ""} assigned to you.`}
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden sm:table-cell">From</TableHead>
                <TableHead className="hidden md:table-cell">Organisation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {convos.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
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
                    {formatDate(c.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {convos.length === 0 && !convosQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No open conversations assigned to you.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Conversation thread dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl flex flex-col gap-0 p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="truncate">{selected?.subject}</span>
              {selected && selected.status !== "closed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void closeConversation(selected.id)}
                >
                  Close conversation
                </Button>
              )}
            </DialogTitle>
            {selected && (
              <p className="text-xs text-muted-foreground">
                From {selected.started_by_profile?.full_name ?? selected.started_by_profile?.email ?? "unknown"}
                {selected.org ? ` · ${selected.org.name}` : ""}
                {" · "}{formatDate(selected.created_at)}
              </p>
            )}
          </DialogHeader>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0 max-h-[50vh]">
            {(messagesQuery.data ?? []).map((m) => {
              const isAgent = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex gap-2 ${isAgent ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isAgent
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {!isAgent && (
                      <p className="mb-1 text-[11px] font-medium opacity-70">
                        {m.sender_name ?? "User"}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[10px] opacity-50 ${isAgent ? "text-right" : ""}`}>
                      {formatDate(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            {(messagesQuery.data ?? []).length === 0 && !messagesQuery.isLoading && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No messages yet. Send the first reply below.
              </p>
            )}
          </div>

          {/* Reply box */}
          {selected?.status !== "closed" && (
            <div className="border-t px-5 py-4 flex gap-2">
              <Textarea
                rows={2}
                placeholder="Type your reply…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void sendReply();
                }}
              />
              <Button onClick={() => void sendReply()} disabled={busy || !reply.trim()} className="self-end">
                <Send className="size-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
