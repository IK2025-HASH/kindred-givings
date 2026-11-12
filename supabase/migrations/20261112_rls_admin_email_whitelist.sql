-- RLS for admin_email_whitelist
-- Only platform admins may read or modify this table.

ALTER TABLE public.admin_email_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_all_admin_email_whitelist"
  ON public.admin_email_whitelist
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));
