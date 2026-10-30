-- Add Stripe-side columns to subscriptions that the webhook handler relies on.
-- Without these the webhook upsert fails silently and subscriptions are never recorded.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start    TIMESTAMPTZ;

-- Index for fast lookups by Stripe subscription ID (used in update/delete webhook events)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id
  ON public.subscriptions (stripe_subscription_id);
