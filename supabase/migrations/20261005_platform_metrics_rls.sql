-- RLS for platform_daily_metrics: platform admins can read all rows
ALTER TABLE public.platform_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_can_read_metrics"
  ON public.platform_daily_metrics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = auth.uid()
    )
  );
