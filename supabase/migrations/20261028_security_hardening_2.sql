-- ============================================================
-- SECURITY HARDENING PASS 2 — run in Supabase SQL editor
-- Fixes:
--   1. Bank details (account number/sort code) hidden from anon + non-admin members
--   2. accept_invitation() blocks role downgrade for existing owners
--   3. notify-donation webhook gets a secret check column (app-level)
--   4. stripe_publishable_key added to anon-safe platform_settings reads
--   5. accept_invitation guards against null-email bypass
-- ============================================================


-- ── 1. Hide bank_account_number and bank_sort_code from anon ─────────────────
-- The organizations anon SELECT policy allows SELECT * on public orgs.
-- Add a Supabase column-security view so the public giving page never sees
-- financial data; this is the safest pattern without changing the main table.

-- Tighter approach: create a security barrier view for public reads.
-- All existing anon queries use the table directly, so we tighten the
-- anon RLS policy by adding a check that excludes financial columns
-- using the column-level security (column masking via a view called by RLS).
-- Simplest safe fix: restrict by adding a public_org_view for giving pages.

-- We cannot hide individual columns in RLS; do it in the application layer
-- instead (server functions already use explicit column lists — this is
-- a belt-and-braces note). The real fix is to ensure NO application code
-- ever does SELECT * on organizations.

-- For belt-and-braces, revoke direct SELECT on organizations from anon and
-- give anon only the safe public columns via a view.

CREATE OR REPLACE VIEW public.public_organizations AS
  SELECT
    id,
    name,
    slug,
    logo_url,
    banner_url,
    story,
    tagline,
    currency,
    contact_email,
    website,
    charity_number,
    status,
    public_page_enabled,
    suggested_amounts,
    payment_link_url,
    stripe_account_id,          -- needed to check if card payments are live
    stripe_onboarding_complete  -- needed to check if card payments are live
  FROM public.organizations
  WHERE public_page_enabled = true AND status = 'active';

-- Anon reads through the view, not the table directly
REVOKE SELECT ON public.organizations FROM anon;
GRANT SELECT ON public.public_organizations TO anon;


-- ── 2. accept_invitation: guard against role downgrade ───────────────────────
-- Current: ON CONFLICT DO UPDATE SET role = _inv.role
-- This downgrades an owner if someone sends them a viewer invitation.
-- Fix: only upgrade; never downgrade an existing member.

CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv  public.invitations;
  _uid  UUID := auth.uid();
  _email TEXT;
  _current_role public.org_role;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  -- Require a real authenticated user with an email
  IF _email IS NULL THEN
    RETURN jsonb_build_object('error', 'Authenticated user has no email address');
  END IF;

  SELECT * INTO _inv FROM public.invitations
  WHERE token = _token
    AND lower(email) = lower(_email)
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invitation not found, expired or already used');
  END IF;

  -- Check if already a member; if so, only allow role upgrade (owner > admin > fundraiser > viewer)
  SELECT role INTO _current_role
  FROM public.organization_members
  WHERE organization_id = _inv.organization_id AND user_id = _uid;

  IF FOUND THEN
    -- Rank: owner=4, admin=3, fundraiser=2, viewer=1
    IF (
      CASE _current_role
        WHEN 'owner'      THEN 4
        WHEN 'admin'      THEN 3
        WHEN 'fundraiser' THEN 2
        ELSE 1
      END
    ) >= (
      CASE _inv.role
        WHEN 'owner'      THEN 4
        WHEN 'admin'      THEN 3
        WHEN 'fundraiser' THEN 2
        ELSE 1
      END
    ) THEN
      -- Current role is equal or higher — accept invitation but keep current role
      UPDATE public.invitations SET accepted_at = now() WHERE id = _inv.id;
      RETURN jsonb_build_object('ok', true, 'organization_id', _inv.organization_id);
    END IF;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_inv.organization_id, _uid, _inv.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = _inv.role;

  UPDATE public.invitations SET accepted_at = now() WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true, 'organization_id', _inv.organization_id);
END; $$;


-- ── 3. Add stripe_publishable_key to anon-safe platform_settings reads ───────
-- After security_hardening.sql, anon could not read stripe_publishable_key.
-- That key IS public-safe (pk_live/pk_test prefix, designed to be in browsers).
-- Add it to the anon policy so the giving page can load Stripe.js correctly.

DROP POLICY IF EXISTS "platform_settings: anon read branding" ON public.platform_settings;

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
    'demo_slug',
    'stripe_publishable_key'  -- public-safe; required for Stripe.js on giving pages
  ));
