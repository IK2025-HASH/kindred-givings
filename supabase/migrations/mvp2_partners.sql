-- MVP2: Partner / Reseller / White-label management
-- Run in Supabase SQL editor

-- ── Partners ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  slug           text        UNIQUE NOT NULL,
  logo_url       text,
  primary_color  text        NOT NULL DEFAULT '#3B82F6',
  custom_domain  text,
  billing_email  text,
  plan           text        NOT NULL DEFAULT 'reseller',
  status         text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'suspended')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- ── Partner members (users who manage a partner account) ──────────
CREATE TABLE IF NOT EXISTS public.partner_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid        NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'admin'
                          CHECK (role IN ('owner', 'admin')),
  invited_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);

ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

-- ── Link existing orgs to a partner ──────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

-- ── RLS policies ─────────────────────────────────────────────────

-- Partner members can read their own partner record
CREATE POLICY "partner_members_read_partner"
  ON public.partners FOR SELECT
  USING (id IN (
    SELECT partner_id FROM public.partner_members WHERE user_id = auth.uid()
  ));

-- Partner owners can update their partner record
CREATE POLICY "partner_owner_update"
  ON public.partners FOR UPDATE
  USING (id IN (
    SELECT partner_id FROM public.partner_members
    WHERE user_id = auth.uid() AND role = 'owner'
  ));

-- Partner members can read other members in same partner
CREATE POLICY "partner_members_read_members"
  ON public.partner_members FOR SELECT
  USING (partner_id IN (
    SELECT partner_id FROM public.partner_members WHERE user_id = auth.uid()
  ));

-- Platform admins full access to partners
CREATE POLICY "platform_admin_partners_all"
  ON public.partners FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM public.platform_admins));

CREATE POLICY "platform_admin_partner_members_all"
  ON public.partner_members FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM public.platform_admins));

-- ── Helper view: partner client summary ──────────────────────────
CREATE OR REPLACE VIEW public.partner_client_summary AS
SELECT
  o.partner_id,
  o.id            AS org_id,
  o.name,
  o.slug,
  o.status,
  o.created_at,
  COUNT(DISTINCT om.user_id)  AS member_count,
  COALESCE(SUM(d.amount), 0)  AS donation_total
FROM public.organizations o
LEFT JOIN public.organization_members om ON om.organization_id = o.id
LEFT JOIN public.donations d ON d.organization_id = o.id AND d.status = 'confirmed'
WHERE o.partner_id IS NOT NULL
GROUP BY o.id;
