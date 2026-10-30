import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PlanFeatureRow = {
  feature_key: string;
  is_enabled: boolean;
  limit_value: number | null;
  plan_name: string;
};

export type PlanFeatures = {
  /** true if the feature is enabled on the current plan */
  hasFeature: (key: string) => boolean;
  /** numeric limit for quantity features; null = unlimited; undefined = feature not found */
  getLimit: (key: string) => number | null | undefined;
  /** true when near or at the limit (≥80%) */
  isNearLimit: (key: string, current: number) => boolean;
  /** true when at or over the limit */
  isAtLimit: (key: string, current: number) => boolean;
  planName: string | null;
  isLoaded: boolean;
};

export function usePlanFeatures(): PlanFeatures {
  const { currentOrg } = useAuth();

  const { data, isSuccess } = useQuery<PlanFeatureRow[]>({
    queryKey: ["plan-features", currentOrg?.id],
    enabled: !!currentOrg?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_org_features" as never, {
        target_org_id: currentOrg!.id,
      } as never);
      if (error) throw error;
      return (data ?? []) as PlanFeatureRow[];
    },
  });

  const map = new Map<string, PlanFeatureRow>();
  for (const row of data ?? []) map.set(row.feature_key, row);

  const planName = data?.[0]?.plan_name ?? null;

  return {
    hasFeature: (key) => map.get(key)?.is_enabled ?? true,
    getLimit: (key) => {
      const row = map.get(key);
      if (!row) return undefined;
      return row.limit_value; // null = unlimited
    },
    isNearLimit: (key, current) => {
      const lim = map.get(key)?.limit_value;
      if (lim == null) return false;
      return current / lim >= 0.8;
    },
    isAtLimit: (key, current) => {
      const lim = map.get(key)?.limit_value;
      if (lim == null) return false;
      return current >= lim;
    },
    planName,
    isLoaded: isSuccess,
  };
}
