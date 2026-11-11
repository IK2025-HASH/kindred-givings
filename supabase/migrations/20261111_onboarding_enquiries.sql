-- ── Onboarding Enquiries ─────────────────────────────────────────────────────
-- Stores public enquiries from the marketing site (donor-book.nl-product-factory.com)
-- Anonymous users can INSERT; only platform admins can SELECT/UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS public.onboarding_enquiries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  name             text NOT NULL,
  organisation     text NOT NULL,
  email            text NOT NULL,
  donor_count      text NOT NULL,  -- dropdown value: 'under_500' | '500_2000' | '2000_10000' | '10000_plus'
  message          text,
  status           text NOT NULL DEFAULT 'new',  -- new | contacted | qualified | closed
  notes            text,
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for admin views
CREATE INDEX IF NOT EXISTS onboarding_enquiries_status_idx ON public.onboarding_enquiries (status);
CREATE INDEX IF NOT EXISTS onboarding_enquiries_created_at_idx ON public.onboarding_enquiries (created_at DESC);

-- RLS
ALTER TABLE public.onboarding_enquiries ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can submit an enquiry
CREATE POLICY "public_insert_enquiries"
  ON public.onboarding_enquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only platform admins can read, update, delete
CREATE POLICY "platform_admins_select_enquiries"
  ON public.onboarding_enquiries
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ));

CREATE POLICY "platform_admins_update_enquiries"
  ON public.onboarding_enquiries
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ));

CREATE POLICY "platform_admins_delete_enquiries"
  ON public.onboarding_enquiries
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ));
