import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgRole = "owner" | "admin" | "fundraiser" | "viewer";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  payment_link_url: string | null;
  tagline: string | null;
  story: string | null;
  currency: string;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  charity_number: string | null;
  status: "active" | "suspended";
  public_page_enabled: boolean;
  suggested_amounts: number[];
};

export type Membership = { role: OrgRole; organization: Organization };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: Membership[];
  membershipsLoading: boolean;
  currentOrg: Organization | null;
  currentRole: OrgRole | null;
  isPlatformAdmin: boolean;
  isChatSupportAgent: boolean;
  setCurrentOrgId: (id: string) => void;
  refreshMemberships: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ORG_KEY = "donorbook.currentOrg";
const ORG_KEY_LEGACY = "givewell.currentOrg";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // Migrate from legacy key if present
    const legacyValue = localStorage.getItem(ORG_KEY_LEGACY);
    if (legacyValue && !localStorage.getItem(ORG_KEY)) {
      localStorage.setItem(ORG_KEY, legacyValue);
      localStorage.removeItem(ORG_KEY_LEGACY);
    }
    setOrgId(localStorage.getItem(ORG_KEY));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  const membershipsQuery = useQuery({
    queryKey: ["memberships", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("role, organizations(*)")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? [])
        .filter((row) => row.organizations)
        .map((row) => ({
          role: row.role as OrgRole,
          organization: row.organizations as unknown as Organization,
        }));
    },
  });

  const adminQuery = useQuery({
    queryKey: ["platform-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const chatSupportQuery = useQuery({
    queryKey: ["chat-support-agent", userId],
    enabled: !!userId,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("chat_support_agents")
          .select("user_id")
          .eq("user_id", userId!)
          .maybeSingle();
        return !!data;
      } catch {
        return false;
      }
    },
  });

  const memberships = membershipsQuery.data ?? [];
  const current =
    memberships.find((m) => m.organization.id === orgId) ?? memberships[0] ?? null;

  const setCurrentOrgId = useCallback((id: string) => {
    localStorage.setItem(ORG_KEY, id);
    setOrgId(id);
  }, []);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    localStorage.removeItem(ORG_KEY);
    await supabase.auth.signOut();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      memberships,
      membershipsLoading: membershipsQuery.isLoading,
      currentOrg: current?.organization ?? null,
      currentRole: current?.role ?? null,
      isPlatformAdmin: adminQuery.data ?? false,
      isChatSupportAgent: chatSupportQuery.data ?? false,
      setCurrentOrgId,
      refreshMemberships: () => {
        void queryClient.invalidateQueries({ queryKey: ["memberships"] });
      },
      signOut,
    }),
    [
      session,
      loading,
      memberships,
      membershipsQuery.isLoading,
      current,
      adminQuery.data,
      chatSupportQuery.data,
      setCurrentOrgId,
      queryClient,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function canEdit(role: OrgRole | null) {
  return role === "owner" || role === "admin" || role === "fundraiser";
}

export function canManageOrg(role: OrgRole | null) {
  return role === "owner" || role === "admin";
}
