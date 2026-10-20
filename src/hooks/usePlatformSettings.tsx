import React, { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULTS, type PlatformSettings } from "@/lib/platform-settings.functions";

export const PlatformSettingsContext = createContext<PlatformSettings>(DEFAULTS);

export function usePlatformSettings(): PlatformSettings {
  return useContext(PlatformSettingsContext);
}

export function usePlatformSettingsQuery() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: async (): Promise<PlatformSettings> => {
      const { data } = await supabase.from("platform_settings").select("key, value");
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      return {
        app_name: map.app_name ?? DEFAULTS.app_name,
        app_tagline: map.app_tagline ?? DEFAULTS.app_tagline,
        app_url: map.app_url ?? DEFAULTS.app_url,
        support_email: map.support_email ?? DEFAULTS.support_email,
        from_email: map.from_email ?? DEFAULTS.from_email,
        legal_email: map.legal_email ?? DEFAULTS.legal_email,
        company_name: map.company_name ?? DEFAULTS.company_name,
        company_address: map.company_address ?? DEFAULTS.company_address,
        platform_currency: map.platform_currency ?? DEFAULTS.platform_currency,
        demo_slug: map.demo_slug ?? DEFAULTS.demo_slug,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function PlatformSettingsProvider({ children }: { children: React.ReactNode }) {
  const { data } = usePlatformSettingsQuery();
  return (
    <PlatformSettingsContext.Provider value={data ?? DEFAULTS}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}
