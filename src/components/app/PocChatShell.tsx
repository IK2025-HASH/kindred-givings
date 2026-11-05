import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, HeartHandshake, LogOut, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ─── Chat panel ──────────────────────────────────────────────────────────────

function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, currentOrg } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) setSent(false);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;
    setBusy(true);
    try {
      const { data: conv, error: convErr } = await supabase
        .from("support_conversations")
        .insert({ org_id: currentOrg?.id ?? null, started_by: user.id, subject: subject.trim(), status: "open" })
        .select("id")
        .single();
      if (convErr) throw convErr;
      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
      const { error: msgErr } = await supabase.from("support_messages").insert({
        conversation_id: conv.id,
        sender_id: user.id,
        sender_name: profile?.full_name ?? profile?.email ?? user.email ?? null,
        body: message.trim(),
      });
      if (msgErr) throw msgErr;
      setSent(true);
      setSubject("");
      setMessage("");
      toast.success("Support request sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 top-16 z-40 flex w-80 flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-in-out",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-primary" />
          <span className="text-sm font-semibold">Contact support</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Check className="size-5 text-primary" />
            </div>
            <p className="text-sm font-medium">Request sent!</p>
            <p className="text-xs text-muted-foreground">Our support team will be in touch soon.</p>
            <Button size="sm" variant="outline" onClick={() => setSent(false)}>
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cs-subject">Subject</Label>
              <Input
                id="cs-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What do you need help with?"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-message">Message</Label>
              <Textarea
                id="cs-message"
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail…"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !subject.trim() || !message.trim()}>
              {busy ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function PocChatShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const settings = usePlatformSettings();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Minimal top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <HeartHandshake className="size-4" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">{settings.app_name}</span>
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            POC · Chat
          </span>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">{user.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", search: { mode: "login" as const }, replace: true });
              }}
            >
              <LogOut className="mr-1.5 size-3.5" />
              Sign out
            </Button>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        {children}
      </main>

      {/* Chat slide-in panel */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* FAB */}
      <button
        onClick={() => setChatOpen((v) => !v)}
        aria-label={chatOpen ? "Close support" : "Contact support"}
        className={cn(
          "fixed bottom-8 right-6 z-50 flex size-14 items-center justify-center rounded-full shadow-xl transition-colors",
          chatOpen
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {chatOpen ? <X className="size-5" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
