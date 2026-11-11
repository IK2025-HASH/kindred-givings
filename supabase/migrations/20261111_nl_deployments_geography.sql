-- Add geography column to nl_deployments
-- SaaS deployments: geography = UK | EU | US | APAC | MEA (NL-hosted instance per region)
-- Customer-hosted deployments: geography = NULL (single-tenant, customer's own infra)
ALTER TABLE public.nl_deployments
  ADD COLUMN IF NOT EXISTS geography text;

COMMENT ON COLUMN public.nl_deployments.geography IS
  'SaaS only: geographic instance (UK, EU, US, APAC, MEA). NULL for customer-hosted deployments.';
