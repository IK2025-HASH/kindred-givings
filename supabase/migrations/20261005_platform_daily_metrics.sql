-- Daily platform growth metrics table
CREATE TABLE IF NOT EXISTS public.platform_daily_metrics (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date     date    DEFAULT CURRENT_DATE UNIQUE,
  total_orgs      int     DEFAULT 0,
  new_orgs_today  int     DEFAULT 0,
  total_donations int     DEFAULT 0,
  new_donations_today int DEFAULT 0,
  total_raised    numeric DEFAULT 0,
  raised_today    numeric DEFAULT 0,
  unique_donors   int     DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Enable pg_cron extension (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily snapshot at 9am UTC (= 9am GMT / 10am BST)
SELECT cron.schedule(
  'platform-daily-metrics',
  '0 9 * * *',
  $$
  INSERT INTO public.platform_daily_metrics (
    report_date,
    total_orgs,
    new_orgs_today,
    total_donations,
    new_donations_today,
    total_raised,
    raised_today,
    unique_donors
  )
  VALUES (
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
