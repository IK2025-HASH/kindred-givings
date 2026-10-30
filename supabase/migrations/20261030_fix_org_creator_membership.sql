-- Allow the org creator to insert themselves as 'owner' before any membership exists.
-- Without this, has_org_role() returns FALSE for a brand-new org (no rows yet)
-- so the WITH CHECK on "org admins manage members" silently drops the INSERT.
CREATE POLICY "org creator can insert as owner"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'owner'
  AND EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_id AND created_by = auth.uid()
  )
);
