import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export type PlatformSettings = {
  app_name: string;
  app_tagline: string;
  app_url: string;
  support_email: string;
  from_email: string;
  legal_email: string;
  company_name: string;
  company_address: string;
  platform_currency: string;
  demo_slug: string;
};

export const DEFAULTS: PlatformSettings = {
  app_name: "Donorbook",
  app_tagline: "Donor management for small UK charities",
  app_url: "https://donorbook.co.uk",
  support_email: "support@donorbook.co.uk",
  from_email: "noreply@donorbook.co.uk",
  legal_email: "legal@donorbook.co.uk",
  company_name: "Donorbook",
  company_address: "Donorbook, England, United Kingdom",
  platform_currency: "GBP",
  demo_slug: "sunrise-childrens-foundation",
};

function rowsToSettings(rows: { key: string; value: string }[]): PlatformSettings {
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
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
}

export const getPlatformSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformSettings> => {
    const { data } = await supabase.from("platform_settings").select("key, value");
    return rowsToSettings(data ?? []);
  }
);
