-- ============ MVP0 additions ============

-- Payment link URL on organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS payment_link_url TEXT;

-- ============ Invite acceptance ============
CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv  public.invitations;
  _uid  UUID := auth.uid();
  _email TEXT;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  SELECT * INTO _inv FROM public.invitations
  WHERE token = _token
    AND lower(email) = lower(COALESCE(_email, ''))
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invitation not found, expired or already used');
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_inv.organization_id, _uid, _inv.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = _inv.role;

  UPDATE public.invitations SET accepted_at = now() WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true, 'organization_id', _inv.organization_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;

-- Allow invitees to look up their own invitation by token (needed for accept flow)
CREATE POLICY "invitee views by token" ON public.invitations
FOR SELECT TO authenticated
USING (lower(email) = lower(COALESCE((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), '')));

-- Allow public page donations to be inserted without an authenticated session
CREATE POLICY "public page donation insert" ON public.donations
FOR INSERT TO anon
WITH CHECK (source = 'public_page' AND status = 'pending');

-- ============ Platform admin whitelist ============
CREATE TABLE IF NOT EXISTS public.admin_email_whitelist (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_email_whitelist TO service_role;

INSERT INTO public.admin_email_whitelist (email)
VALUES ('ilyas@networklogic.uk')
ON CONFLICT DO NOTHING;

-- Auto-grant platform_admin when a whitelisted email signs up
CREATE OR REPLACE FUNCTION public.maybe_grant_platform_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.admin_email_whitelist
    WHERE lower(email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.platform_admins (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_user_maybe_admin ON auth.users;
CREATE TRIGGER on_user_maybe_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.maybe_grant_platform_admin();

-- Grant to any existing user with the whitelisted email
INSERT INTO public.platform_admins (user_id)
SELECT u.id FROM auth.users u
WHERE lower(u.email) = 'ilyas@networklogic.uk'
ON CONFLICT DO NOTHING;

-- ============ Admin helpers ============
CREATE OR REPLACE FUNCTION public.admin_org_summary()
RETURNS TABLE (
  org_id UUID, name TEXT, slug TEXT, status public.org_status,
  plan_name TEXT, member_count BIGINT, donation_total NUMERIC, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id, o.name, o.slug, o.status,
    p.name AS plan_name,
    COUNT(DISTINCT m.user_id) AS member_count,
    COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'confirmed'), 0) AS donation_total,
    o.created_at
  FROM public.organizations o
  LEFT JOIN public.subscriptions s ON s.organization_id = o.id
  LEFT JOIN public.plans p ON p.id = s.plan_id
  LEFT JOIN public.organization_members m ON m.organization_id = o.id
  LEFT JOIN public.donations d ON d.organization_id = o.id
  GROUP BY o.id, o.name, o.slug, o.status, p.name, o.created_at
  ORDER BY o.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_org_summary() TO authenticated;
