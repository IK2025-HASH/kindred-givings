-- ============================================================
-- USER MANAGEMENT v2 — also update auth.users so login is blocked
-- ============================================================

-- Drop and recreate admin_set_user_suspended to also ban in auth.users
DROP FUNCTION IF EXISTS public.admin_set_user_suspended(uuid, boolean);

CREATE OR REPLACE FUNCTION public.admin_set_user_suspended(
  target_user_id uuid,
  suspended      boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot suspend yourself';
  END IF;

  -- Update profile flag
  UPDATE public.profiles SET is_suspended = suspended WHERE id = target_user_id;

  -- Ban / unban in auth so login is also blocked
  IF suspended THEN
    UPDATE auth.users SET banned_until = 'infinity' WHERE id = target_user_id;
  ELSE
    UPDATE auth.users SET banned_until = NULL WHERE id = target_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(uuid, boolean) TO authenticated;


-- Drop and recreate admin_delete_user to also remove from auth.users
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

  -- Delete profile (cascades to org memberships etc.)
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Hard-delete from auth so they cannot sign up again with same session
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
