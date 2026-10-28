-- Fix "permission denied for table users" on Team page
-- The "invitee views by token" policy was querying auth.users directly.
-- The authenticated role doesn't have SELECT on auth.users — use auth.email() instead.

DROP POLICY IF EXISTS "invitee views by token" ON public.invitations;

CREATE POLICY "invitee views by token" ON public.invitations
FOR SELECT TO authenticated
USING (lower(email) = lower(COALESCE(auth.email(), '')));
