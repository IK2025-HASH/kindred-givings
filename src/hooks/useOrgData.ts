import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Donor = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  postcode: string | null;
  tags: string[];
  notes: string | null;
  gift_aid_declaration: boolean;
  created_at: string;
};

export type Campaign = {
  id: string;
  organization_id: string;
  title: string;
  slug: string | null;
  description: string | null;
  target_amount: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: "draft" | "active" | "completed" | "archived";
  media_url: string | null;
};

export type Donation = {
  id: string;
  organization_id: string;
  donor_id: string | null;
  campaign_id: string | null;
  amount: number;
  currency: string;
  donated_on: string;
  method: "cash" | "bank_transfer" | "cheque" | "card" | "online" | "other";
  status: "pending" | "confirmed" | "refunded" | "failed";
  is_recurring: boolean;
  gift_aid: boolean;
  is_anonymous: boolean;
  reference: string | null;
  message: string | null;
  source: string;
  donor_name: string | null;
  donor_email: string | null;
  created_at: string;
};

export function useDonors(orgId: string | null) {
  return useQuery({
    queryKey: ["donors", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Donor[]> => {
      const { data, error } = await supabase
        .from("donors")
        .select("*")
        .eq("organization_id", orgId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as Donor[];
    },
  });
}

export function useCampaigns(orgId: string | null) {
  return useQuery({
    queryKey: ["campaigns", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
  });
}

export function useDonations(orgId: string | null) {
  return useQuery({
    queryKey: ["donations", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Donation[]> => {
      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .eq("organization_id", orgId!)
        .order("donated_on", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, amount: Number(d.amount) })) as unknown as Donation[];
    },
  });
}

export type SubscriptionPlan = {
  max_donors: number;
  max_campaigns: number;
  max_members: number;
  max_qr_boxes: number;
};

export function useSubscription(orgId: string | null) {
  return useQuery({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ plan: SubscriptionPlan | null } | null> => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("status, plans(max_donors, max_campaigns, max_members, max_qr_boxes)")
        .eq("organization_id", orgId!)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { plan: (data.plans as unknown as SubscriptionPlan | null) ?? null };
    },
  });
}

export function useTeam(orgId: string | null) {
  return useQuery({
    queryKey: ["team", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [members, invites] = await Promise.all([
        supabase
          .from("organization_members")
          .select("id, role, user_id, created_at, profiles:user_id(full_name, email)")
          .eq("organization_id", orgId!),
        supabase
          .from("invitations")
          .select("id, email, role, accepted_at, expires_at, created_at, token")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false }),
      ]);
      if (members.error) throw members.error;
      if (invites.error) throw invites.error;
      return {
        members: (members.data ?? []) as unknown as Array<{
          id: string;
          role: string;
          user_id: string;
          created_at: string;
          profiles: { full_name: string | null; email: string | null } | null;
        }>,
        invitations: (invites.data ?? []) as unknown as Array<{
          id: string;
          email: string;
          role: string;
          accepted_at: string | null;
          expires_at: string;
          created_at: string;
          token: string | null;
        }>,
      };
    },
  });
}
