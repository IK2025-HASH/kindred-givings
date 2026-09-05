-- ============ enums ============
CREATE TYPE public.org_role AS ENUM ('owner','admin','fundraiser','viewer');
CREATE TYPE public.donation_method AS ENUM ('cash','bank_transfer','cheque','card','online','other');
CREATE TYPE public.donation_status AS ENUM ('pending','confirmed','refunded','failed');
CREATE TYPE public.org_status AS ENUM ('active','suspended');
CREATE TYPE public.campaign_status AS ENUM ('draft','active','completed','archived');

-- ============ shared trigger ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
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
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ platform admins ============
CREATE TABLE public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id);
$$;

CREATE POLICY "admins read platform admins" ON public.platform_admins
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- ============ plans ============
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_members INTEGER NOT NULL DEFAULT 3,
  max_donors INTEGER NOT NULL DEFAULT 500,
  max_campaigns INTEGER NOT NULL DEFAULT 3,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view published plans" ON public.plans
FOR SELECT TO anon, authenticated USING (is_active AND is_public);
CREATE POLICY "platform admins manage plans" ON public.plans
FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER plans_updated BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ organizations ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  story TEXT,
  tagline TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  charity_number TEXT,
  status public.org_status NOT NULL DEFAULT 'active',
  public_page_enabled BOOLEAN NOT NULL DEFAULT true,
  suggested_amounts INTEGER[] NOT NULL DEFAULT ARRAY[10,25,50,100],
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============ members ============
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org UUID, _roles public.org_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org AND role = ANY(_roles)
  );
$$;

CREATE POLICY "members view own org memberships" ON public.organization_members
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "org admins manage members" ON public.organization_members
FOR ALL TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin(auth.uid()));

-- organizations policies (need helpers defined first)
CREATE POLICY "public can view public orgs" ON public.organizations
FOR SELECT TO anon, authenticated
USING ((public_page_enabled AND status = 'active') OR public.is_org_member(auth.uid(), id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "authenticated can create orgs" ON public.organizations
FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "org admins update org" ON public.organizations
FOR UPDATE TO authenticated
USING (public.has_org_role(auth.uid(), id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_org_role(auth.uid(), id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "owners delete org" ON public.organizations
FOR DELETE TO authenticated
USING (public.has_org_role(auth.uid(), id, ARRAY['owner']::public.org_role[]) OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER orgs_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- profiles policies (after helpers)
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
CREATE POLICY "update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ subscriptions ============
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  billing_period TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view subscription" ON public.subscriptions
FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "platform admins manage subscriptions" ON public.subscriptions
FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ invitations ============
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.org_role NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins manage invitations" ON public.invitations
FOR ALL TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "invitee views own invitation" ON public.invitations
FOR SELECT TO authenticated USING (lower(email) = lower(COALESCE(auth.jwt()->>'email','')));

-- ============ campaigns ============
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  target_amount NUMERIC(12,2),
  starts_on DATE,
  ends_on DATE,
  status public.campaign_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_org_idx ON public.campaigns(organization_id);
GRANT SELECT ON public.campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view active campaigns" ON public.campaigns
FOR SELECT TO anon, authenticated
USING (
  (status = 'active' AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.public_page_enabled AND o.status = 'active'))
  OR public.is_org_member(auth.uid(), organization_id)
  OR public.is_platform_admin(auth.uid())
);
CREATE POLICY "org staff manage campaigns" ON public.campaigns
FOR ALL TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]));
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ donors ============
CREATE TABLE public.donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  gift_aid_declaration BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX donors_org_idx ON public.donors(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donors TO authenticated;
GRANT ALL ON public.donors TO service_role;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view donors" ON public.donors
FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org staff manage donors" ON public.donors
FOR ALL TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]));
CREATE TRIGGER donors_updated BEFORE UPDATE ON public.donors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ donations ============
CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES public.donors(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  donated_on DATE NOT NULL DEFAULT CURRENT_DATE,
  method public.donation_method NOT NULL DEFAULT 'cash',
  status public.donation_status NOT NULL DEFAULT 'confirmed',
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  gift_aid BOOLEAN NOT NULL DEFAULT false,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  reference TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  donor_name TEXT,
  donor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX donations_org_idx ON public.donations(organization_id);
CREATE INDEX donations_date_idx ON public.donations(organization_id, donated_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view donations" ON public.donations
FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "org staff manage donations" ON public.donations
FOR ALL TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','fundraiser']::public.org_role[]));
CREATE TRIGGER donations_updated BEFORE UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ public aggregate helpers ============
CREATE OR REPLACE FUNCTION public.public_org_stats(_slug TEXT)
RETURNS TABLE (total_raised NUMERIC, supporters BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(d.amount),0)::numeric, COUNT(*)::bigint
  FROM public.donations d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE o.slug = _slug AND o.public_page_enabled AND o.status = 'active' AND d.status = 'confirmed';
$$;
GRANT EXECUTE ON FUNCTION public.public_org_stats(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_recent_supporters(_slug TEXT)
RETURNS TABLE (display_name TEXT, amount NUMERIC, donated_on DATE, message TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN d.is_anonymous THEN 'Anonymous' ELSE COALESCE(d.donor_name, 'Supporter') END,
         d.amount, d.donated_on, CASE WHEN d.is_anonymous THEN NULL ELSE d.message END
  FROM public.donations d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE o.slug = _slug AND o.public_page_enabled AND o.status = 'active' AND d.status = 'confirmed'
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

-- ============ seed data ============
INSERT INTO public.plans (name, slug, description, price_monthly, price_yearly, max_members, max_donors, max_campaigns, features, sort_order) VALUES
 ('Starter','starter','For small charities getting organised',0,0,3,500,3,'["Donor records","Donation tracking","Public giving page","Basic reports"]'::jsonb,1),
 ('Growth','growth','For growing fundraising teams',29,290,10,5000,25,'["Everything in Starter","Team roles and invitations","Campaign targets","CSV import and export","Advanced reports"]'::jsonb,2),
 ('Enterprise','enterprise','For national charities',99,990,100,1000000,1000,'["Everything in Growth","Unlimited campaigns","Priority support","Custom branding","Audit ready exports"]'::jsonb,3);

INSERT INTO public.organizations (id, name, slug, tagline, story, currency, contact_email, website, charity_number, suggested_amounts)
VALUES ('11111111-1111-1111-1111-111111111111','Riverside Community Trust','riverside','Food, shelter and warmth for our neighbours',
 'Riverside Community Trust has supported families across the borough since 2009. Every gift funds hot meals, emergency shelter beds and winter fuel grants for people who need them most.',
 'GBP','hello@riversidetrust.org','https://riversidetrust.org','1123456', ARRAY[15,30,60,120]);

INSERT INTO public.subscriptions (organization_id, plan_id, billing_period)
SELECT '11111111-1111-1111-1111-111111111111', id, 'monthly' FROM public.plans WHERE slug = 'growth';

INSERT INTO public.campaigns (id, organization_id, title, description, target_amount, starts_on, ends_on, status) VALUES
 ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111111','Winter Warmth Appeal','Heating grants and warm packs for older residents through the coldest months.',25000,'2026-10-01','2027-02-28','active'),
 ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111111','Community Food Hub','Weekly food parcels for 240 local families.',18000,'2026-01-01','2026-12-31','active'),
 ('22222222-2222-2222-2222-222222222203','11111111-1111-1111-1111-111111111111','Youth Skills Programme','Training and mentoring for 16-24 year olds leaving care.',12000,'2026-03-01','2026-11-30','active');

INSERT INTO public.donors (id, organization_id, full_name, email, phone, city, postcode, country, tags, gift_aid_declaration) VALUES
 ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111111','Amelia Hartley','amelia.hartley@example.com','07700 900123','Leeds','LS1 4AB','United Kingdom',ARRAY['regular','gift-aid'],true),
 ('33333333-3333-3333-3333-333333333302','11111111-1111-1111-1111-111111111111','Daniel Okafor','daniel.okafor@example.com','07700 900456','Leeds','LS6 2NN','United Kingdom',ARRAY['major-donor'],true),
 ('33333333-3333-3333-3333-333333333303','11111111-1111-1111-1111-111111111111','Priya Raman','priya.raman@example.com','07700 900789','Bradford','BD1 1PR','United Kingdom',ARRAY['regular'],false),
 ('33333333-3333-3333-3333-333333333304','11111111-1111-1111-1111-111111111111','Thomas Whitfield','tom.whitfield@example.com',NULL,'Wakefield','WF1 3QT','United Kingdom',ARRAY['corporate'],false),
 ('33333333-3333-3333-3333-333333333305','11111111-1111-1111-1111-111111111111','Grace Lin','grace.lin@example.com','07700 900321','Leeds','LS2 8LT','United Kingdom',ARRAY['new'],true);

INSERT INTO public.donations (organization_id, donor_id, campaign_id, amount, donated_on, method, status, is_recurring, gift_aid, donor_name, source, reference) VALUES
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',30,CURRENT_DATE - 3,'bank_transfer','confirmed',true,true,'Amelia Hartley','manual','SO-1001'),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',30,CURRENT_DATE - 34,'bank_transfer','confirmed',true,true,'Amelia Hartley','manual','SO-1000'),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222203',2500,CURRENT_DATE - 12,'bank_transfer','confirmed',false,true,'Daniel Okafor','manual','MG-204'),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222202',60,CURRENT_DATE - 6,'card','confirmed',false,false,'Priya Raman','public_page',NULL),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333304','22222222-2222-2222-2222-222222222202',1200,CURRENT_DATE - 20,'cheque','confirmed',false,false,'Thomas Whitfield','manual','CHQ-88'),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222201',120,CURRENT_DATE - 1,'card','confirmed',false,true,'Grace Lin','public_page',NULL),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222202',60,CURRENT_DATE - 40,'card','confirmed',false,false,'Priya Raman','public_page',NULL),
 ('11111111-1111-1111-1111-111111111111',NULL,'22222222-2222-2222-2222-222222222201',45,CURRENT_DATE - 2,'online','pending',false,false,'Anonymous well-wisher','public_page',NULL),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222201',500,CURRENT_DATE - 60,'bank_transfer','confirmed',false,true,'Daniel Okafor','manual','MG-198'),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222203',75,CURRENT_DATE - 75,'cash','confirmed',false,false,'Grace Lin','manual',NULL);