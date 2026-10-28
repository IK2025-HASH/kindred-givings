-- Fix admin_org_summary: cast org_status enum to text to match declared return type
DROP FUNCTION IF EXISTS public.admin_org_summary();

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
    o.status::text,
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
