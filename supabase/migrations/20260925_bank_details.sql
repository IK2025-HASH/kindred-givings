ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS bank_account_name    TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number  TEXT,
  ADD COLUMN IF NOT EXISTS bank_sort_code       TEXT,
  ADD COLUMN IF NOT EXISTS bank_reference_hint  TEXT,
  ADD COLUMN IF NOT EXISTS banner_url           TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_url     TEXT;
