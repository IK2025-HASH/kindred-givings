import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Inbox, Send } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  head: () => ({
    meta: [{ title: "Inbox — Donorbook" }],
  }),
  component: InboxPage,
});

function InboxPage() {
  const { user, currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const [tab, setTab] = useState("inbox");

  const received = useQuery({
    queryKey: ["messages", "inbox", orgId, user?.id],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, from_profile:profiles!messages_from_user_id_fkey(full_name, email)")
        .eq("organization_id", orgId!)
        .eq("to_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sent = useQuery({
    queryKey: ["messages", "sent", orgId, user?.id],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, to_profile:profiles!messages_to_user_id_fkey(full_name, email)")
        .eq("organization_id", orgId!)
        .eq("from_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const announcements = useQuery({
    queryKey: ["announcements"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unreadCount = (received.data ?? []).filter((m) => !m.read_at).length;

  async function markRead(id: string) {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("to_user_id", user!.id);
    void received.refetch();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Messages and platform announcements"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="size-4" />
            Inbox
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="size-4" />
            Sent
          </TabsTrigger>
          <TabsTrigger value="announcements" className="gap-2">
            <Bell className="size-4" />
            Announcements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          {received.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!received.isLoading && (received.data ?? []).length === 0 && (
            <EmptyState message="No messages yet." />
          )}
          <div className="space-y-2">
            {(received.data ?? []).map((msg) => (
              <Card
                key={msg.id}
                className={msg.read_at ? "opacity-70" : "border-primary/40"}
                onClick={() => { if (!msg.read_at) void markRead(msg.id); }}
              >
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!msg.read_at && <span className="inline-block size-2 rounded-full bg-primary" />}
                      <p className="truncate text-sm font-semibold">{msg.subject}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      From: {(msg as { from_profile?: { full_name?: string; email?: string } }).from_profile?.full_name ?? (msg as { from_profile?: { full_name?: string; email?: string } }).from_profile?.email ?? "Unknown"}
                    </p>
                    <p className="mt-1 text-sm">{msg.body}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{formatDate(msg.created_at)}</time>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          {sent.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!sent.isLoading && (sent.data ?? []).length === 0 && (
            <EmptyState message="No sent messages." />
          )}
          <div className="space-y-2">
            {(sent.data ?? []).map((msg) => (
              <Card key={msg.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{msg.subject}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      To: {(msg as { to_profile?: { full_name?: string; email?: string } }).to_profile?.full_name ?? (msg as { to_profile?: { full_name?: string; email?: string } }).to_profile?.email ?? "Unknown"}
                    </p>
                    <p className="mt-1 text-sm">{msg.body}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{formatDate(msg.created_at)}</time>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="announcements" className="mt-4">
          {announcements.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!announcements.isLoading && (announcements.data ?? []).length === 0 && (
            <EmptyState message="No announcements yet." />
          )}
          <div className="space-y-2">
            {(announcements.data ?? []).map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <p className="mt-1 text-sm">{a.body}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{formatDate(a.created_at)}</time>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
