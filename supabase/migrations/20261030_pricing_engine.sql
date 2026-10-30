-- ============================================================
-- Pricing Engine v1
-- features table  +  plan_features join  +  enforcement RPC
-- ============================================================

-- ── Feature registry ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,       -- machine key used in code
  label       TEXT NOT NULL,             -- human-readable name
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'access',  -- 'access' | 'limits' | 'integrations'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read features" ON public.features
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage features" ON public.features
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

GRANT SELECT ON public.features TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.features TO authenticated;
GRANT ALL ON public.features TO service_role;

-- ── Plan ↔ Feature join ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_id   UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  limit_value  INTEGER,   -- NULL = unlimited; only meaningful for 'limits' category
  UNIQUE (plan_id, feature_id)
);

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read plan_features" ON public.plan_features
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage plan_features" ON public.plan_features
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

GRANT SELECT ON public.plan_features TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_features TO authenticated;
GRANT ALL ON public.plan_features TO service_role;

-- ── Seed: feature registry ──────────────────────────────────
INSERT INTO public.features (key, label, description, category, sort_order) VALUES
  -- access
  ('donor_management',   'Donor management',      'Create and manage donor records',               'access', 10),
  ('donation_tracking',  'Donation tracking',      'Record and track incoming donations',           'access', 20),
  ('campaign_management','Campaign management',    'Create and manage fundraising campaigns',       'access', 30),
  ('public_giving_page', 'Public giving page',     'Shareable public page for online giving',       'access', 40),
  ('team_management',    'Team management',        'Invite team members and assign roles',          'access', 50),
  ('reports_basic',      'Basic reports',          'Standard fundraising reports and summaries',    'access', 60),
  ('reports_advanced',   'Advanced reports',       'Detailed analytics, trend charts, exports',     'access', 70),
  ('csv_export',         'CSV import & export',    'Bulk import donors and export data as CSV',     'access', 80),
  ('qr_boxes',           'QR Boxes',               'Physical QR code fundraising boxes',            'access', 90),
  ('inbox',              'Inbox',                  'Internal messaging and announcements',          'access', 100),
  ('custom_branding',    'Custom branding',        'White-label logo, colours and domain',         'access', 110),
  ('priority_support',   'Priority support',       'Dedicated support channel with SLA',           'access', 120),
  ('audit_exports',      'Audit-ready exports',    'HMRC Gift Aid and auditor-grade exports',      'access', 130),
  -- limits
  ('max_donors',    'Donor records limit',    'Maximum number of donor records',   'limits', 200),
  ('max_campaigns', 'Campaign limit',         'Maximum number of active campaigns','limits', 210),
  ('max_members',   'Team member limit',      'Maximum number of team members',    'limits', 220)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- ── Seed: plan_features (Starter) ──────────────────────────
-- Uses a CTE so we can reference feature/plan by slug/key, not hardcoded UUIDs
WITH
  p AS (SELECT id FROM public.plans WHERE slug = 'starter'),
  f AS (SELECT id, key FROM public.features)
INSERT INTO public.plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id,
  CASE f.key
    WHEN 'donor_management'    THEN true
    WHEN 'donation_tracking'   THEN true
    WHEN 'campaign_management' THEN true
    WHEN 'public_giving_page'  THEN true
    WHEN 'team_management'     THEN true
    WHEN 'reports_basic'       THEN true
    WHEN 'reports_advanced'    THEN false
    WHEN 'csv_export'          THEN false
    WHEN 'qr_boxes'            THEN false
    WHEN 'inbox'               THEN false
    WHEN 'custom_branding'     THEN false
    WHEN 'priority_support'    THEN false
    WHEN 'audit_exports'       THEN false
    WHEN 'max_donors'          THEN true
    WHEN 'max_campaigns'       THEN true
    WHEN 'max_members'         THEN true
    ELSE false
  END,
  CASE f.key
    WHEN 'max_donors'    THEN 500
    WHEN 'max_campaigns' THEN 3
    WHEN 'max_members'   THEN 3
    ELSE NULL
  END
FROM p CROSS JOIN f
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled  = EXCLUDED.is_enabled,
  limit_value = EXCLUDED.limit_value;

-- ── Seed: plan_features (Growth) ───────────────────────────
WITH
  p AS (SELECT id FROM public.plans WHERE slug = 'growth'),
  f AS (SELECT id, key FROM public.features)
INSERT INTO public.plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id,
  CASE f.key
    WHEN 'donor_management'    THEN true
    WHEN 'donation_tracking'   THEN true
    WHEN 'campaign_management' THEN true
    WHEN 'public_giving_page'  THEN true
    WHEN 'team_management'     THEN true
    WHEN 'reports_basic'       THEN true
    WHEN 'reports_advanced'    THEN true
    WHEN 'csv_export'          THEN true
    WHEN 'qr_boxes'            THEN true
    WHEN 'inbox'               THEN true
    WHEN 'custom_branding'     THEN false
    WHEN 'priority_support'    THEN false
    WHEN 'audit_exports'       THEN false
    WHEN 'max_donors'          THEN true
    WHEN 'max_campaigns'       THEN true
    WHEN 'max_members'         THEN true
    ELSE false
  END,
  CASE f.key
    WHEN 'max_donors'    THEN 5000
    WHEN 'max_campaigns' THEN 25
    WHEN 'max_members'   THEN 10
    ELSE NULL
  END
FROM p CROSS JOIN f
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled  = EXCLUDED.is_enabled,
  limit_value = EXCLUDED.limit_value;

-- ── Seed: plan_features (Enterprise) ───────────────────────
WITH
  p AS (SELECT id FROM public.plans WHERE slug = 'enterprise'),
  f AS (SELECT id, key FROM public.features)
INSERT INTO public.plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id,
  CASE f.key
    WHEN 'donor_management'    THEN true
    WHEN 'donation_tracking'   THEN true
    WHEN 'campaign_management' THEN true
    WHEN 'public_giving_page'  THEN true
    WHEN 'team_management'     THEN true
    WHEN 'reports_basic'       THEN true
    WHEN 'reports_advanced'    THEN true
    WHEN 'csv_export'          THEN true
    WHEN 'qr_boxes'            THEN true
    WHEN 'inbox'               THEN true
    WHEN 'custom_branding'     THEN true
    WHEN 'priority_support'    THEN true
    WHEN 'audit_exports'       THEN true
    WHEN 'max_donors'          THEN true
    WHEN 'max_campaigns'       THEN true
    WHEN 'max_members'         THEN true
    ELSE true
  END,
  CASE f.key
    WHEN 'max_donors'    THEN NULL  -- unlimited
    WHEN 'max_campaigns' THEN NULL  -- unlimited
    WHEN 'max_members'   THEN 100
    ELSE NULL
  END
FROM p CROSS JOIN f
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled  = EXCLUDED.is_enabled,
  limit_value = EXCLUDED.limit_value;

-- ── Helper RPC: get_org_features(org_id) ───────────────────
-- Returns the current plan's feature set for an organisation.
-- Falls back to the 'starter' plan when no active subscription exists.
CREATE OR REPLACE FUNCTION public.get_org_features(target_org_id UUID)
RETURNS TABLE (
  feature_key  TEXT,
  is_enabled   BOOLEAN,
  limit_value  INTEGER,
  plan_name    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_plan AS (
    -- Active or trialling subscription wins first
    SELECT s.plan_id, p.name AS plan_name
    FROM   public.subscriptions s
    JOIN   public.plans p ON p.id = s.plan_id
    WHERE  s.organization_id = target_org_id
      AND  s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  fallback_plan AS (
    -- No subscription → default to Starter
    SELECT p.id AS plan_id, p.name AS plan_name
    FROM   public.plans p
    WHERE  p.slug = 'starter'
    LIMIT 1
  ),
  resolved AS (
    SELECT * FROM active_plan
    UNION ALL
    SELECT * FROM fallback_plan
    LIMIT 1
  )
  SELECT
    f.key           AS feature_key,
    pf.is_enabled,
    pf.limit_value,
    r.plan_name
  FROM   resolved r
  JOIN   public.plan_features pf ON pf.plan_id = r.plan_id
  JOIN   public.features f       ON f.id = pf.feature_id
  ORDER BY f.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_features(UUID) TO authenticated;
