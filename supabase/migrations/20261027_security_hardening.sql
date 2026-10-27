-- ============================================================
-- SECURITY HARDENING — run in Supabase SQL editor
-- Fixes: RLS missing on admin_email_whitelist (CRITICAL),
--        admin_org_summary callable by any user (CRITICAL),
--        anon donation insert too permissive (HIGH),
--        platform_settings fully public (HIGH)
-- ============================================================

-- ── 1. admin_email_whitelist: lock it down completely ────────
-- This table controls who becomes a platform admin.
-- No authenticated or anon user should ever read or write it.
-- Only service_role (internal DB triggers) may access it.

ALTER TABLE public.admin_email_whitelist ENABLE ROW LEVEL SECURITY;

-- Deny everything to authenticated and anon roles.
-- Service_role bypasses RLS by default — no policy needed for it.
CREATE POLICY "admin_email_whitelist: deny all"
  ON public.admin_email_whitelist
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);


-- ── 2. admin_org_summary RPC: restrict to platform admins ───
-- Currently callable by any logged-in user.
-- Revoke from authenticated, allow only platform admins via a wrapper check.

REVOKE EXECUTE ON FUNCTION public.admin_org_summary() FROM authenticated;

-- Re-create with an internal admin guard
CREATE OR REPLACE FUNCTION public.admin_org_summary()
RETURNS TABLE (
  org_id        uuid,
  name          text,
  slug          text,
  status        text,
  plan_name     text,
  member_count  bigint,
  donation_total numeric,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Abort if caller is not a platform admin
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.status,
    p.name AS plan_name,
    (SELECT COUNT(*) FROM public.organization_members m WHERE m.organization_id = o.id)::bigint,
    COALESCE((SELECT SUM(d.amount) FROM public.donations d WHERE d.organization_id = o.id AND d.status = 'confirmed'), 0),
    o.created_at
  FROM public.organizations o
  LEFT JOIN public.subscriptions s ON s.organization_id = o.id AND s.status = 'active'
  LEFT JOIN public.plans p ON p.id = s.plan_id
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_org_summary() TO authenticated;


-- ── 3. Tighten the anon donation INSERT policy ───────────────
-- Current policy allows anon INSERT with source='public_page' AND status='pending'.
-- Add: amount must be positive, currency must be a known value.

DROP POLICY IF EXISTS "public page donation insert" ON public.donations;

CREATE POLICY "public page donation insert"
  ON public.donations
  FOR INSERT
  TO anon
  WITH CHECK (
    source = 'public_page'
    AND status = 'pending'
    AND amount > 0
    AND currency IN ('GBP', 'USD', 'EUR', 'CAD', 'AUD')
  );


-- ── 4. platform_settings: restrict public read to safe keys only ──
-- The current policy exposes ALL keys to all users.
-- Stripe publishable key and email config should not be world-readable.

DROP POLICY IF EXISTS "platform_settings: public read" ON public.platform_settings;

-- Only these keys are safe for any authenticated user to read
CREATE POLICY "platform_settings: public read safe keys"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (key IN (
    'app_name',
    'app_tagline',
    'app_url',
    'primary_colour',
    'secondary_colour',
    'logo_url',
    'platform_currency',
    'demo_slug'
  ));

-- Anon users (public giving page) get only branding keys
CREATE POLICY "platform_settings: anon read branding"
  ON public.platform_settings
  FOR SELECT
  TO anon
  USING (key IN (
    'app_name',
    'app_tagline',
    'logo_url',
    'primary_colour',
    'secondary_colour',
    'platform_currency',
    'demo_slug'
  ));

-- Platform admins read everything
CREATE POLICY "platform_settings: admin read all"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
    )
  );
