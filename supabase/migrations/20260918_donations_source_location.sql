-- Add source_location to donations so public giving page can tag where a donation came from
-- (e.g. a specific QR box location passed via ?loc= query param)
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS source_location TEXT;
