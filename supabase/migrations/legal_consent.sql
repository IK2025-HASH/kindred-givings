-- Track user agreement to Terms of Service, Privacy Policy, and Data Retention Policy
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

-- Index for compliance queries (e.g. "who accepted before v2024-01?")
CREATE INDEX IF NOT EXISTS profiles_terms_version_idx ON public.profiles (terms_version)
  WHERE terms_version IS NOT NULL;
