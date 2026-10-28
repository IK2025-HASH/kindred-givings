-- ============================================================
-- Fix admin_delete_user: also remove orgs where user is sole owner
-- and clean up orphaned orgs from previous bad deletes
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete yourself';
  END IF;

  -- Delete organizations where this user is the sole member (owner with no other members)
  DELETE FROM public.organizations
  WHERE id IN (
    SELECT om.organization_id
    FROM public.organization_members om
    WHERE om.user_id = target_user_id
      AND om.role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members om2
        WHERE om2.organization_id = om.organization_id
          AND om2.user_id <> target_user_id
      )
  );

  -- Delete profile (cascades to org memberships, invitations sent, etc.)
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Hard-delete from auth so they cannot sign up again with same session
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ============================================================
-- Clean up orphaned organisations from previous bad deletes
-- (orgs with no members at all)
-- ============================================================
DELETE FROM public.organizations
WHERE id NOT IN (
  SELECT DISTINCT organization_id FROM public.organization_members
);
