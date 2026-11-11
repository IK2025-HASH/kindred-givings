-- ── Protected super-admin slot ───────────────────────────────────────────────
-- ilyas@networklogic.uk retains platform admin access on every deployment
-- (cloud multi-tenant AND any on-premise instance) for support purposes.
-- This entry cannot be deleted by any other admin, including charity owners.

-- 1. Add is_protected flag to platform_admins
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

-- 2. Add protected_email so we can seed by email without requiring a user row to exist yet.
--    When the user registers, the trigger below links them automatically.
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS protected_email text;

CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_protected_email_key
  ON public.platform_admins (protected_email)
  WHERE protected_email IS NOT NULL;

-- 3. Seed the Network Logic UK super-admin row (email-keyed, not user_id-keyed yet).
--    If ilyas@networklogic.uk is already registered this upserts and links the user_id.
INSERT INTO public.platform_admins (user_id, is_protected, protected_email)
SELECT
  u.id,
  true,
  'ilyas@networklogic.uk'
FROM auth.users u
WHERE u.email = 'ilyas@networklogic.uk'
ON CONFLICT (user_id) DO UPDATE
  SET is_protected    = true,
      protected_email = 'ilyas@networklogic.uk';

-- Note: a NULL user_id placeholder is not inserted here because platform_admins.user_id
-- is NOT NULL. For fresh on-premise installs where the user has not yet registered,
-- run the trigger manually after first sign-in, or re-run this migration post-signup.
-- The trigger below (trg_link_protected_admin) handles auto-linking on signup.

-- 4. Trigger: when ilyas@networklogic.uk registers (or already exists),
--    automatically link the user_id and ensure is_protected = true.
CREATE OR REPLACE FUNCTION public.link_protected_admin_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.platform_admins
  SET user_id      = NEW.id,
      is_protected = true
  WHERE protected_email = NEW.email
    AND (user_id IS NULL OR user_id <> NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_protected_admin ON auth.users;
CREATE TRIGGER trg_link_protected_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_protected_admin_on_signup();

-- 5. Trigger: block deletion of any protected platform_admin row.
CREATE OR REPLACE FUNCTION public.prevent_protected_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_protected THEN
    RAISE EXCEPTION
      'Cannot remove protected platform admin (%). This slot is reserved by Network Logic UK for support access.',
      COALESCE(OLD.protected_email, OLD.user_id::text);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_protected_admin_delete ON public.platform_admins;
CREATE TRIGGER trg_prevent_protected_admin_delete
  BEFORE DELETE ON public.platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_protected_admin_delete();

-- 6. Trigger: block UPDATE that would clear is_protected on the protected row.
CREATE OR REPLACE FUNCTION public.prevent_protected_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_protected AND NOT NEW.is_protected THEN
    RAISE EXCEPTION
      'Cannot revoke protected status from platform admin (%).',
      COALESCE(OLD.protected_email, OLD.user_id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_protected_admin_update ON public.platform_admins;
CREATE TRIGGER trg_prevent_protected_admin_update
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_protected_admin_update();

-- 7. Expose is_protected in the existing admin query surface
--    (no schema change needed; the column is already on the table).
