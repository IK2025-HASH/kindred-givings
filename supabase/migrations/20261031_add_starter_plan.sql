-- ============================================================
-- Add Starter/Free plan as the fallback tier
-- Required by get_org_features() which falls back to slug='starter'
-- ============================================================

INSERT INTO public.plans (
  name, slug, description,
  price_monthly, price_yearly,
  max_donors, max_campaigns, max_members,
  features, sort_order,
  is_active, is_public
) VALUES (
  'Starter',
  'starter',
  'Get started for free — perfect for small charities',
  0, 0,
  100, 3, 3,
  to_jsonb(ARRAY[
    'Up to 100 donor records',
    'Up to 3 campaigns',
    'Up to 3 team members',
    'Basic reports',
    'Public giving page'
  ]),
  1,
  true, true
)
ON CONFLICT (slug) DO NOTHING;

-- Seed plan_features for Starter
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
    WHEN 'max_donors'    THEN 100
    WHEN 'max_campaigns' THEN 3
    WHEN 'max_members'   THEN 3
    ELSE NULL
  END
FROM p CROSS JOIN f
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled  = EXCLUDED.is_enabled,
  limit_value = EXCLUDED.limit_value;
