-- Deployment engine: delivery method + geography instance ref + provisioning notes
-- delivery_method: customer-hosted only (docker | manual | both)
-- geography_instance_ref: SaaS only — reference to the geography DB/project
-- provisioning_notes: free-text checklist/notes for the current stage

ALTER TABLE public.nl_deployments
  ADD COLUMN IF NOT EXISTS delivery_method       text,   -- docker | manual | both (customer_hosted only)
  ADD COLUMN IF NOT EXISTS geography_instance_ref text,  -- e.g. "supabase project zaex..., AWS eu-west-2" (saas only)
  ADD COLUMN IF NOT EXISTS provisioning_notes    text;   -- stage checklist / handover notes

COMMENT ON COLUMN public.nl_deployments.delivery_method IS
  'Customer-hosted only: docker | manual | both. NULL for SaaS.';
COMMENT ON COLUMN public.nl_deployments.geography_instance_ref IS
  'SaaS only: reference to the geography DB project / hosting details. NULL for customer-hosted.';
COMMENT ON COLUMN public.nl_deployments.provisioning_notes IS
  'Free-text stage notes / provisioning checklist for this deployment.';
