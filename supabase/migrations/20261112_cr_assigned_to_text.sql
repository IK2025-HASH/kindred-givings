-- Change nl_change_requests.assigned_to from uuid ref to plain text
-- (dev names/initials rather than user accounts — internal team may not have accounts)

ALTER TABLE public.nl_change_requests
  DROP COLUMN IF EXISTS assigned_to;

ALTER TABLE public.nl_change_requests
  ADD COLUMN assigned_to text;

COMMENT ON COLUMN public.nl_change_requests.assigned_to IS
  'Free-text name or initials of the developer assigned to this CR.';
