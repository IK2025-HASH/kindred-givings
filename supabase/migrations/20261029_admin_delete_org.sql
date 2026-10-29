-- Platform admin hard-delete for organisations.
-- Cascades to organization_members, subscriptions, etc. via FK ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.admin_delete_org(target_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.organizations WHERE id = target_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_org(UUID) TO authenticated;
