-- API keys for external REST API access (MVP1 paid feature)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,          -- first 8 chars of raw key for display (e.g. "gw_ab12c")
  key_hash text NOT NULL UNIQUE,     -- SHA-256 hex of the full raw key
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's keys
CREATE POLICY "org members read api_keys" ON public.api_keys
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Org owners/admins can manage keys
CREATE POLICY "org admins manage api_keys" ON public.api_keys
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Index for fast key lookups (used on every API request)
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON public.api_keys (key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON public.api_keys (organization_id);
