-- ── Feature List / User Stories ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  title       text NOT NULL,
  description text,
  type        text NOT NULL DEFAULT 'feature',  -- feature | user_story | bug | epic
  status      text NOT NULL DEFAULT 'backlog',  -- backlog | in_progress | done | deferred
  priority    text NOT NULL DEFAULT 'normal',   -- low | normal | high | critical
  sort_order  int  NOT NULL DEFAULT 999,
  tags        text[] DEFAULT '{}'
);

ALTER TABLE public.admin_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admins_all_features" ON public.admin_features
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── Partner Management ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  name             text NOT NULL,
  email            text NOT NULL UNIQUE,
  company          text,
  status           text NOT NULL DEFAULT 'active',  -- active | suspended | pending
  partner_code     text NOT NULL UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
  reward_type      text NOT NULL DEFAULT 'credits',  -- credits | monetary
  reward_rate      numeric NOT NULL DEFAULT 0.10,    -- e.g. 0.10 = 10%
  reward_levels    int  NOT NULL DEFAULT 1,          -- multi-level depth (1-3)
  level2_rate      numeric NOT NULL DEFAULT 0.05,
  level3_rate      numeric NOT NULL DEFAULT 0.02,
  total_referrals  int  NOT NULL DEFAULT 0,
  total_earned     numeric NOT NULL DEFAULT 0,
  notes            text
);

CREATE INDEX IF NOT EXISTS partners_code_idx ON public.partners (partner_code);
CREATE INDEX IF NOT EXISTS partners_status_idx ON public.partners (status);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admins_all_partners" ON public.partners
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── Partner Referrals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  partner_id     uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referred_org   uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  referred_email text,
  status         text NOT NULL DEFAULT 'pending',  -- pending | converted | rejected
  reward_amount  numeric NOT NULL DEFAULT 0,
  reward_paid    boolean NOT NULL DEFAULT false,
  level          int  NOT NULL DEFAULT 1           -- which reward tier
);

CREATE INDEX IF NOT EXISTS partner_referrals_partner_idx ON public.partner_referrals (partner_id);

ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admins_all_referrals" ON public.partner_referrals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── Safe read-only SQL runner for admin DB inspection ─────────────────────────
-- Validates that query is SELECT-only before executing.
CREATE OR REPLACE FUNCTION public.admin_run_select(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalised text;
  result     jsonb;
BEGIN
  -- Platform admin check
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  normalised := upper(trim(regexp_replace(query, '\s+', ' ', 'g')));

  -- Only allow SELECT statements; block anything else
  IF normalised NOT LIKE 'SELECT %' THEN
    RAISE EXCEPTION 'Only SELECT queries are permitted';
  END IF;

  -- Block dangerous keywords even inside SELECT
  IF normalised ~* '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY|SET\s+ROLE)\M' THEN
    RAISE EXCEPTION 'Query contains disallowed keywords';
  END IF;

  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

-- ── Updated_at triggers for new tables ───────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['admin_features','partners'])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;
