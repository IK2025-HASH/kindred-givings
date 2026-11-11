-- ── NL Commercial Management Tables ──────────────────────────────────────────
-- Implements NL-PAOMS v1.0 sections 3–8:
-- Customer records, deployments, licences, support contracts, change requests.
-- All tables are platform-admin only (no end-user access).

-- ── 1. NL Customers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nl_customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  name              text NOT NULL,
  registered_address text,
  primary_contact   jsonb,  -- { name, email, phone }
  technical_contact jsonb,
  commercial_contact jsonb,
  billing_details   jsonb,
  status            text NOT NULL DEFAULT 'prospect',
  -- prospect | active | suspended | churned
  notes             text
);

CREATE INDEX IF NOT EXISTS nl_customers_status_idx ON public.nl_customers (status);

ALTER TABLE public.nl_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_customers"
  ON public.nl_customers
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── 2. NL Deployments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nl_deployments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  customer_id         uuid NOT NULL REFERENCES public.nl_customers(id) ON DELETE CASCADE,
  deployment_model    text NOT NULL DEFAULT 'saas',  -- saas | customer_hosted
  status              text NOT NULL DEFAULT 'enquiry',
  -- enquiry | assessment | quoted | contracted | authorised | provisioning | deployed | uat | live | suspended | retired
  hosting_provider    text,
  deployment_location text,
  app_version         text,
  enabled_modules     text[] DEFAULT '{}',
  go_live_date        date,
  maintenance_status  text NOT NULL DEFAULT 'active',  -- active | expired
  notes               text,
  -- Infrastructure readiness fields (section 6.2)
  infra_signed_off    boolean NOT NULL DEFAULT false,
  infra_notes         text
);

CREATE INDEX IF NOT EXISTS nl_deployments_customer_idx ON public.nl_deployments (customer_id);
CREATE INDEX IF NOT EXISTS nl_deployments_status_idx ON public.nl_deployments (status);

ALTER TABLE public.nl_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_deployments"
  ON public.nl_deployments
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── 3. NL Licences ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nl_licences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  customer_id     uuid NOT NULL REFERENCES public.nl_customers(id) ON DELETE CASCADE,
  deployment_id   uuid REFERENCES public.nl_deployments(id) ON DELETE SET NULL,
  licence_key     text UNIQUE,          -- human-readable reference e.g. KG-2025-001
  licensed_product text NOT NULL DEFAULT 'Kindred Givings',
  enabled_modules text[] DEFAULT '{}',
  start_date      date NOT NULL,
  expiry_date     date NOT NULL,
  grace_until     date,                 -- expiry + 30 days
  status          text NOT NULL DEFAULT 'active',
  -- active | grace | expired | revoked
  maintenance_status text NOT NULL DEFAULT 'active',  -- active | expired
  notes           text
);

CREATE INDEX IF NOT EXISTS nl_licences_customer_idx ON public.nl_licences (customer_id);
CREATE INDEX IF NOT EXISTS nl_licences_status_idx ON public.nl_licences (status);
CREATE INDEX IF NOT EXISTS nl_licences_expiry_idx ON public.nl_licences (expiry_date);

ALTER TABLE public.nl_licences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_licences"
  ON public.nl_licences
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── 4. NL Support Contracts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nl_support_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  customer_id     uuid NOT NULL REFERENCES public.nl_customers(id) ON DELETE CASCADE,
  deployment_id   uuid REFERENCES public.nl_deployments(id) ON DELETE SET NULL,
  contract_ref    text,
  sla_tier        text NOT NULL DEFAULT 'standard',  -- standard | enhanced | premium
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'active',   -- active | expired | cancelled
  response_times  jsonb,  -- { p1_hours, p2_hours, p3_hours }
  notes           text
);

CREATE INDEX IF NOT EXISTS nl_support_customer_idx ON public.nl_support_contracts (customer_id);
CREATE INDEX IF NOT EXISTS nl_support_status_idx ON public.nl_support_contracts (status);

ALTER TABLE public.nl_support_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_support"
  ON public.nl_support_contracts
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── 5. NL Change Requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nl_change_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  customer_id     uuid REFERENCES public.nl_customers(id) ON DELETE SET NULL,
  deployment_id   uuid REFERENCES public.nl_deployments(id) ON DELETE SET NULL,
  cr_ref          text,                -- e.g. CR-2025-004
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'requested',
  -- requested | under_review | quoted | approved | in_development | delivered | rejected | withdrawn
  priority        text NOT NULL DEFAULT 'normal',  -- low | normal | high | critical
  estimated_days  numeric,
  agreed_price    numeric,
  currency        text NOT NULL DEFAULT 'GBP',
  funded_by_customer boolean NOT NULL DEFAULT false,
  incorporate_in_product boolean NOT NULL DEFAULT false,
  assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_version  text,
  notes           text
);

CREATE INDEX IF NOT EXISTS nl_cr_customer_idx ON public.nl_change_requests (customer_id);
CREATE INDEX IF NOT EXISTS nl_cr_status_idx ON public.nl_change_requests (status);

ALTER TABLE public.nl_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_cr"
  ON public.nl_change_requests
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── Triggers: auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['nl_customers','nl_deployments','nl_licences','nl_support_contracts','nl_change_requests'])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;
