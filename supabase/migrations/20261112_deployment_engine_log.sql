-- ── Deployment Engine Log ────────────────────────────────────────────────────
-- Immutable, timestamped audit log for every deployment action.
-- Written by the UI wizard as each step executes.

CREATE TABLE IF NOT EXISTS public.nl_deployment_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES public.nl_deployments(id) ON DELETE CASCADE,
  ts            timestamptz NOT NULL DEFAULT now(),
  event_code    text NOT NULL,          -- e.g. SSH_CONNECTED, MIGRATION_APPLIED
  severity      text NOT NULL DEFAULT 'info',  -- info | success | warn | error | debug
  actor         text NOT NULL DEFAULT 'engine',  -- engine | operator:{user_id} | system
  message       text NOT NULL,
  detail        jsonb,                  -- structured payload (exit_code, stdout, etc.)
  duration_ms   integer,                -- step duration
  step_index    integer                 -- sequential step number within deployment
);

CREATE INDEX IF NOT EXISTS nl_deploy_log_deployment_idx ON public.nl_deployment_log (deployment_id, ts);
CREATE INDEX IF NOT EXISTS nl_deploy_log_severity_idx ON public.nl_deployment_log (deployment_id, severity);

ALTER TABLE public.nl_deployment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_deployment_log"
  ON public.nl_deployment_log
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- ── Smoke test results ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nl_smoke_tests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES public.nl_deployments(id) ON DELETE CASCADE,
  run_at        timestamptz NOT NULL DEFAULT now(),
  total         integer NOT NULL DEFAULT 0,
  passed        integer NOT NULL DEFAULT 0,
  failed        integer NOT NULL DEFAULT 0,
  results       jsonb  -- [{name, passed, duration_ms, error?}]
);

ALTER TABLE public.nl_smoke_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_nl_smoke_tests"
  ON public.nl_smoke_tests
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));
