-- =============================================================================
-- Donorbook — Full Database Setup Script
--
-- Idempotent: safe to run on a fresh project OR re-run as an upgrade.
-- It never drops tables, never deletes rows, and never overwrites existing data.
--
-- Patterns used:
--   • Tables / indexes / extensions : CREATE ... IF NOT EXISTS
--   • Functions / triggers          : CREATE OR REPLACE / DROP TRIGGER IF EXISTS
--   • Enum types                    : DO $$ ... IF NOT EXISTS check (PG 9.1+)
--   • RLS policies                  : DROP POLICY IF EXISTS + CREATE POLICY
--                                     (safest upgrade path — no data touched)
--   • Column additions              : ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   • Seed rows                     : INSERT ... ON CONFLICT DO NOTHING
--
-- ⚠  Update the admin email near section 3 before running on a new project.
-- =============================================================================


-- ============================================================================
-- 1. CORE SCHEMA
-- ============================================================================

-- Enum types — CREATE TYPE has no IF NOT EXISTS before PG 14; use DO block
DO $$ BEGIN
  CREATE TYPE public.org_role      AS ENUM ('owner','admin','fundraiser','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.donation_method AS ENUM ('cash','bank_transfer','cheque','card','online','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.donation_status AS ENUM ('pending','confirmed','refunded','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.org_status AS ENUM ('active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM ('draft','active','completed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- platform admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id);
$$;

DROP POLICY IF EXISTS "admins read platform admins" ON public.platform_admins;
CREATE POLICY "admins read platform admins" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- plans
CREATE TABLE IF NOT EXISTS public.plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly  NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_members   INTEGER NOT NULL DEFAULT 3,
  max_donors    INTEGER NOT NULL DEFAULT 500,
  max_campaigns INTEGER NOT NULL DEFAULT 3,
  features      JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can view published plans" ON public.plans;
CREATE POLICY "public can view published plans" ON public.plans
  FOR SELECT TO anon, authenticated USING (is_active AND is_public);

DROP POLICY IF EXISTS "platform admins manage plans" ON public.plans;
CREATE POLICY "platform admins manage plans" ON public.plans
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS plans_updated ON public.plans;
CREATE TRIGGER plans_updated
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  logo_url             TEXT,
  story                TEXT,
  tagline              TEXT,
  currency             TEXT NOT NULL DEFAULT 'GBP',
  contact_email        TEXT,
  contact_phone        TEXT,
  website              TEXT,
  charity_number       TEXT,
  status               public.org_status NOT NULL DEFAULT 'active',
  public_page_enabled  BOOLEAN NOT NULL DEFAULT true,
  suggested_amounts    INTEGER[] NOT NULL DEFAULT ARRAY[10,25,50,100],
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- organization members
CREATE TABLE IF NOT EXISTS public.organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            public.org_role NOT NULL DEFAULT 'viewer',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org UUID, _roles public.org_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org AND role = ANY(_roles)
  );
$$;

DROP POLICY IF EXISTS "members view own org memberships" ON public.organization_members;
CREATE POLICY "members view own org memberships" ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_member(auth.uid(), organization_id)
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "org admins manage members" ON public.organization_members;
CREATE POLICY "org admins manage members" ON public.organization_members
  FOR ALL TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  );

-- organizations RLS (helpers must exist first)
DROP POLICY IF EXISTS "public can view public orgs" ON public.organizations;
CREATE POLICY "public can view public orgs" ON public.organizations
  FOR SELECT TO anon, authenticated
  USING (
    (public_page_enabled AND status = 'active')
    OR public.is_org_member(auth.uid(), id)
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "authenticated can create orgs" ON public.organizations;
CREATE POLICY "authenticated can create orgs" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "org admins update org" ON public.organizations;
CREATE POLICY "org admins update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.has_org_role(auth.uid(), id, ARRAY['owner','admin']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_role(auth.uid(), id, ARRAY['owner','admin']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "owners delete org" ON public.organizations;
CREATE POLICY "owners delete org" ON public.organizations
  FOR DELETE TO authenticated
  USING (
    public.has_org_role(auth.uid(), id, ARRAY['owner']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  );

DROP TRIGGER IF EXISTS orgs_updated ON public.organizations;
CREATE TRIGGER orgs_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- profiles RLS (helpers must exist first)
DROP POLICY IF EXISTS "read own and teammate profiles" ON public.profiles;
CREATE POLICY "read own and teammate profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_members m1
      JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = public.profiles.id
    )
  );

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP TRIGGER IF EXISTS profiles_updated ON public.profiles;
CREATE TRIGGER profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id            UUID NOT NULL REFERENCES public.plans(id),
  billing_period     TEXT NOT NULL DEFAULT 'monthly',
  status             TEXT NOT NULL DEFAULT 'active',
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view subscription" ON public.subscriptions;
CREATE POLICY "members view subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "platform admins manage subscriptions" ON public.subscriptions;
CREATE POLICY "platform admins manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS subs_updated ON public.subscriptions;
CREATE TRIGGER subs_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            public.org_role NOT NULL DEFAULT 'viewer',
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org admins manage invitations" ON public.invitations;
CREATE POLICY "org admins manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[])
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "invitee views own invitation" ON public.invitations;
CREATE POLICY "invitee views own invitation" ON public.invitations
  FOR SELECT TO authenticated
  USING (lower(email) = lower(COALESCE(auth.jwt()->>'email','')));

-- campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  slug            TEXT,
  description     TEXT,
  target_amount   NUMERIC(12,2),
  starts_on       DATE,
  ends_on         DATE,
  status          public.campaign_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_org_idx ON public.campaigns(organization_id);
GRANT SELECT ON public.campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can view active campaigns" ON public.campaigns;
CREATE POLICY "public can view active campaigns" ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (
    (status = 'active' AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.public_page_enabled AND o.status = 'active'
    ))
    OR public.is_org_member(auth.uid(), organization_id)
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "org staff manage campaigns" ON public.campaigns;
CREATE POLICY "org staff manage campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]));

DROP TRIGGER IF EXISTS campaigns_updated ON public.campaigns;
CREATE TRIGGER campaigns_updated
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- donors
CREATE TABLE IF NOT EXISTS public.donors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  postcode             TEXT,
  country              TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  notes                TEXT,
  gift_aid_declaration BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS donors_org_idx ON public.donors(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donors TO authenticated;
GRANT ALL ON public.donors TO service_role;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view donors" ON public.donors;
CREATE POLICY "members view donors" ON public.donors
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "org staff manage donors" ON public.donors;
CREATE POLICY "org staff manage donors" ON public.donors
  FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]));

DROP TRIGGER IF EXISTS donors_updated ON public.donors;
CREATE TRIGGER donors_updated
  BEFORE UPDATE ON public.donors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- donations
CREATE TABLE IF NOT EXISTS public.donations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id        UUID REFERENCES public.donors(id) ON DELETE SET NULL,
  campaign_id     UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'GBP',
  donated_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  method          public.donation_method NOT NULL DEFAULT 'cash',
  status          public.donation_status NOT NULL DEFAULT 'confirmed',
  is_recurring    BOOLEAN NOT NULL DEFAULT false,
  gift_aid        BOOLEAN NOT NULL DEFAULT false,
  is_anonymous    BOOLEAN NOT NULL DEFAULT false,
  reference       TEXT,
  message         TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  donor_name      TEXT,
  donor_email     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS donations_org_idx  ON public.donations(organization_id);
CREATE INDEX IF NOT EXISTS donations_date_idx ON public.donations(organization_id, donated_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view donations" ON public.donations;
CREATE POLICY "members view donations" ON public.donations
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "org staff manage donations" ON public.donations;
CREATE POLICY "org staff manage donations" ON public.donations
  FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]));

DROP TRIGGER IF EXISTS donations_updated ON public.donations;
CREATE TRIGGER donations_updated
  BEFORE UPDATE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- public aggregate helper functions
CREATE OR REPLACE FUNCTION public.public_org_stats(_slug TEXT)
RETURNS TABLE (total_raised NUMERIC, supporters BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(d.amount),0)::numeric, COUNT(*)::bigint
  FROM public.donations d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE o.slug = _slug AND o.public_page_enabled AND o.status = 'active'
    AND d.status = 'confirmed';
$$;
GRANT EXECUTE ON FUNCTION public.public_org_stats(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_recent_supporters(_slug TEXT)
RETURNS TABLE (display_name TEXT, amount NUMERIC, donated_on DATE, message TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE WHEN d.is_anonymous THEN 'Anonymous' ELSE COALESCE(d.donor_name, 'Supporter') END,
    d.amount, d.donated_on,
    CASE WHEN d.is_anonymous THEN NULL ELSE d.message END
  FROM public.donations d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE o.slug = _slug AND o.public_page_enabled AND o.status = 'active'
    AND d.status = 'confirmed'
  ORDER BY d.donated_on DESC, d.created_at DESC
  LIMIT 8;
$$;
GRANT EXECUTE ON FUNCTION public.public_recent_supporters(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.campaign_raised(_org UUID)
RETURNS TABLE (campaign_id UUID, raised NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.campaign_id, COALESCE(SUM(d.amount),0)::numeric
  FROM public.donations d
  WHERE d.organization_id = _org AND d.status = 'confirmed' AND d.campaign_id IS NOT NULL
  GROUP BY d.campaign_id;
$$;
GRANT EXECUTE ON FUNCTION public.campaign_raised(UUID) TO anon, authenticated;

-- seed data — skipped silently if already present
INSERT INTO public.plans (name, slug, description, price_monthly, price_yearly, max_members, max_donors, max_campaigns, features, sort_order) VALUES
  ('Starter',    'starter',    'For small charities getting organised',  0,   0,   3,   500,     3,   '["Donor records","Donation tracking","Public giving page","Basic reports"]'::jsonb, 1),
  ('Growth',     'growth',     'For growing fundraising teams',          29,  290, 10,  5000,    25,  '["Everything in Starter","Team roles and invitations","Campaign targets","CSV import and export","Advanced reports"]'::jsonb, 2),
  ('Enterprise', 'enterprise', 'For national charities',                 99,  990, 100, 1000000, 1000,'["Everything in Growth","Unlimited campaigns","Priority support","Custom branding","Audit ready exports"]'::jsonb, 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, tagline, story, currency, contact_email, website, charity_number, suggested_amounts)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Riverside Community Trust', 'riverside',
  'Food, shelter and warmth for our neighbours',
  'Riverside Community Trust has supported families across the borough since 2009. Every gift funds hot meals, emergency shelter beds and winter fuel grants for people who need them most.',
  'GBP', 'hello@riversidetrust.org', 'https://riversidetrust.org', '1123456', ARRAY[15,30,60,120]
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.subscriptions (organization_id, plan_id, billing_period)
SELECT '11111111-1111-1111-1111-111111111111', id, 'monthly'
FROM public.plans WHERE slug = 'growth'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.campaigns (id, organization_id, title, description, target_amount, starts_on, ends_on, status) VALUES
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111111','Winter Warmth Appeal',  'Heating grants and warm packs for older residents.',       25000,'2026-10-01','2027-02-28','active'),
  ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111111','Community Food Hub',    'Weekly food parcels for 240 local families.',             18000,'2026-01-01','2026-12-31','active'),
  ('22222222-2222-2222-2222-222222222203','11111111-1111-1111-1111-111111111111','Youth Skills Programme','Training and mentoring for 16–24 year olds leaving care.',12000,'2026-03-01','2026-11-30','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.donors (id, organization_id, full_name, email, phone, city, postcode, country, tags, gift_aid_declaration) VALUES
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111111','Amelia Hartley', 'amelia.hartley@example.com','07700 900123','Leeds',    'LS1 4AB','United Kingdom',ARRAY['regular','gift-aid'],true),
  ('33333333-3333-3333-3333-333333333302','11111111-1111-1111-1111-111111111111','Daniel Okafor',  'daniel.okafor@example.com', '07700 900456','Leeds',    'LS6 2NN','United Kingdom',ARRAY['major-donor'],       true),
  ('33333333-3333-3333-3333-333333333303','11111111-1111-1111-1111-111111111111','Priya Raman',    'priya.raman@example.com',   '07700 900789','Bradford', 'BD1 1PR','United Kingdom',ARRAY['regular'],            false),
  ('33333333-3333-3333-3333-333333333304','11111111-1111-1111-1111-111111111111','Thomas Whitfield','tom.whitfield@example.com', NULL,          'Wakefield','WF1 3QT','United Kingdom',ARRAY['corporate'],          false),
  ('33333333-3333-3333-3333-333333333305','11111111-1111-1111-1111-111111111111','Grace Lin',      'grace.lin@example.com',     '07700 900321','Leeds',    'LS2 8LT','United Kingdom',ARRAY['new'],                true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.donations (organization_id, donor_id, campaign_id, amount, donated_on, method, status, is_recurring, gift_aid, donor_name, source, reference) VALUES
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',30,  CURRENT_DATE-3, 'bank_transfer','confirmed',true, true, 'Amelia Hartley','manual','SO-1001'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',30,  CURRENT_DATE-34,'bank_transfer','confirmed',true, true, 'Amelia Hartley','manual','SO-1000'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222203',2500,CURRENT_DATE-12,'bank_transfer','confirmed',false,true, 'Daniel Okafor', 'manual','MG-204'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222202',60,  CURRENT_DATE-6, 'card',        'confirmed',false,false,'Priya Raman',   'public_page',NULL),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333304','22222222-2222-2222-2222-222222222202',1200,CURRENT_DATE-20,'cheque',      'confirmed',false,false,'Thomas Whitfield','manual','CHQ-88'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222201',120, CURRENT_DATE-1, 'card',        'confirmed',false,true, 'Grace Lin',     'public_page',NULL),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222202',60,  CURRENT_DATE-40,'card',        'confirmed',false,false,'Priya Raman',   'public_page',NULL),
  ('11111111-1111-1111-1111-111111111111',NULL,                                 '22222222-2222-2222-2222-222222222201',45,  CURRENT_DATE-2, 'online',      'pending',  false,false,'Anonymous well-wisher','public_page',NULL),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222201',500, CURRENT_DATE-60,'bank_transfer','confirmed',false,true, 'Daniel Okafor', 'manual','MG-198'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222203',75,  CURRENT_DATE-75,'cash',        'confirmed',false,false,'Grace Lin',     'manual',NULL)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 2. FUNCTION PERMISSION GRANTS
-- ============================================================================

REVOKE ALL ON FUNCTION public.handle_new_user()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_raised(UUID)                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.campaign_raised(UUID)                  TO authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin(UUID)                    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_platform_admin(UUID)                TO anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_member(UUID, UUID)                  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_org_member(UUID, UUID)              TO anon, authenticated;
REVOKE ALL ON FUNCTION public.has_org_role(UUID, UUID, public.org_role[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_org_role(UUID, UUID, public.org_role[]) TO authenticated;


-- ============================================================================
-- 3. MVP0 ADDITIONS
-- ============================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS payment_link_url TEXT;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv   public.invitations;
  _uid   UUID := auth.uid();
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

DROP POLICY IF EXISTS "invitee views by token" ON public.invitations;
CREATE POLICY "invitee views by token" ON public.invitations
  FOR SELECT TO authenticated
  USING (lower(email) = lower(COALESCE(
    (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), ''
  )));

DROP POLICY IF EXISTS "public page donation insert" ON public.donations;
CREATE POLICY "public page donation insert" ON public.donations
  FOR INSERT TO anon
  WITH CHECK (source = 'public_page' AND status = 'pending');

CREATE TABLE IF NOT EXISTS public.admin_email_whitelist (
  email    TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_email_whitelist TO service_role;

-- ⚠ UPDATE THIS to your admin email before running on a new project
INSERT INTO public.admin_email_whitelist (email)
VALUES ('ilyas@networklogic.uk')
ON CONFLICT DO NOTHING;

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

-- grant platform_admin to any already-existing user on the whitelist
INSERT INTO public.platform_admins (user_id)
SELECT u.id FROM auth.users u
WHERE lower(u.email) = 'ilyas@networklogic.uk'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_org_summary()
RETURNS TABLE (
  org_id UUID, name TEXT, slug TEXT, status public.org_status,
  plan_name TEXT, member_count BIGINT, donation_total NUMERIC, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug, o.status, p.name,
    COUNT(DISTINCT m.user_id), COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'confirmed'), 0),
    o.created_at
  FROM public.organizations o
  LEFT JOIN public.subscriptions s       ON s.organization_id = o.id
  LEFT JOIN public.plans p               ON p.id = s.plan_id
  LEFT JOIN public.organization_members m ON m.organization_id = o.id
  LEFT JOIN public.donations d           ON d.organization_id = o.id
  GROUP BY o.id, o.name, o.slug, o.status, p.name, o.created_at
  ORDER BY o.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_org_summary() TO authenticated;


-- ============================================================================
-- 4. SOURCE LOCATION ON DONATIONS
-- ============================================================================

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS source_location TEXT;


-- ============================================================================
-- 5. BANK DETAILS ON ORGANIZATIONS
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS bank_account_name   TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_sort_code      TEXT,
  ADD COLUMN IF NOT EXISTS bank_reference_hint TEXT,
  ADD COLUMN IF NOT EXISTS banner_url          TEXT;
-- payment_link_url already added in section 3


-- ============================================================================
-- 6. PLATFORM DAILY METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_daily_metrics (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date         DATE        DEFAULT CURRENT_DATE UNIQUE,
  total_orgs          INT         DEFAULT 0,
  new_orgs_today      INT         DEFAULT 0,
  total_donations     INT         DEFAULT 0,
  new_donations_today INT         DEFAULT 0,
  total_raised        NUMERIC     DEFAULT 0,
  raised_today        NUMERIC     DEFAULT 0,
  unique_donors       INT         DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'platform-daily-metrics',
  '0 9 * * *',
  $$
  INSERT INTO public.platform_daily_metrics (
    report_date, total_orgs, new_orgs_today, total_donations,
    new_donations_today, total_raised, raised_today, unique_donors
  ) VALUES (
    CURRENT_DATE,
    (SELECT COUNT(*) FROM public.organizations),
    (SELECT COUNT(*) FROM public.organizations WHERE created_at::date = CURRENT_DATE),
    (SELECT COUNT(*) FROM public.donations WHERE status = 'confirmed'),
    (SELECT COUNT(*) FROM public.donations WHERE status = 'confirmed' AND created_at::date = CURRENT_DATE),
    (SELECT COALESCE(SUM(amount), 0) FROM public.donations WHERE status = 'confirmed'),
    (SELECT COALESCE(SUM(amount), 0) FROM public.donations WHERE status = 'confirmed' AND created_at::date = CURRENT_DATE),
    (SELECT COUNT(DISTINCT donor_email) FROM public.donations WHERE donor_email IS NOT NULL AND status = 'confirmed')
  )
  ON CONFLICT (report_date) DO UPDATE SET
    total_orgs          = EXCLUDED.total_orgs,
    new_orgs_today      = EXCLUDED.new_orgs_today,
    total_donations     = EXCLUDED.total_donations,
    new_donations_today = EXCLUDED.new_donations_today,
    total_raised        = EXCLUDED.total_raised,
    raised_today        = EXCLUDED.raised_today,
    unique_donors       = EXCLUDED.unique_donors;
  $$
);


-- ============================================================================
-- 7. RLS FOR PLATFORM DAILY METRICS
-- ============================================================================

ALTER TABLE public.platform_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_can_read_metrics" ON public.platform_daily_metrics;
CREATE POLICY "platform_admins_can_read_metrics" ON public.platform_daily_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));


-- ============================================================================
-- 8. STRIPE CONNECT COLUMNS
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_account_id          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;


-- ============================================================================
-- 9. LEGAL CONSENT ON PROFILES
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version     TEXT;

CREATE INDEX IF NOT EXISTS profiles_terms_version_idx
  ON public.profiles (terms_version)
  WHERE terms_version IS NOT NULL;


-- ============================================================================
-- 10. PLATFORM SETTINGS (brand / config key-value store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings: public read" ON public.platform_settings;
CREATE POLICY "platform_settings: public read" ON public.platform_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "platform_settings: admin write" ON public.platform_settings;
CREATE POLICY "platform_settings: admin write" ON public.platform_settings
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

INSERT INTO public.platform_settings (key, value) VALUES
  ('app_name',          'Donorbook'),
  ('app_tagline',       'Donor management for small UK charities'),
  ('app_url',           'https://donorbook.co.uk'),
  ('support_email',     'support@donorbook.co.uk'),
  ('from_email',        'noreply@donorbook.co.uk'),
  ('legal_email',       'legal@donorbook.co.uk'),
  ('company_name',      'Donorbook'),
  ('company_address',   'Donorbook, England, United Kingdom'),
  ('platform_currency', 'GBP'),
  ('demo_slug',         'sunrise-childrens-foundation')
ON CONFLICT (key) DO NOTHING;
