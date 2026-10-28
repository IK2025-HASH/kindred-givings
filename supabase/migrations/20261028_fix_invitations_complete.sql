-- ============================================================
-- Complete invitations policy rewrite — eliminates all auth.users
-- references and forces PostgREST schema cache reload
-- ============================================================

-- Drop ALL policies on invitations and start clean
DROP POLICY IF EXISTS "org admins manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "invitee views own invitation" ON public.invitations;
DROP POLICY IF EXISTS "invitee views by token" ON public.invitations;

-- Org owners/admins can do everything
CREATE POLICY "org admins manage invitations" ON public.invitations
FOR ALL TO authenticated
USING (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[])
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::public.org_role[])
  OR public.is_platform_admin(auth.uid())
);

-- Invitee can view their own pending invitations (for accept flow)
CREATE POLICY "invitee views own invitation" ON public.invitations
FOR SELECT TO authenticated
USING (lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')));

-- Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Create chat_support_agents table if it doesn't exist
-- (queried in useAuth.tsx — missing table causes silent errors)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_support_agents (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chat_support_agents TO authenticated;
GRANT ALL ON public.chat_support_agents TO service_role;
ALTER TABLE public.chat_support_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform admins manage chat agents" ON public.chat_support_agents;
CREATE POLICY "platform admins manage chat agents" ON public.chat_support_agents
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "agents view own record" ON public.chat_support_agents;
CREATE POLICY "agents view own record" ON public.chat_support_agents
FOR SELECT TO authenticated
USING (user_id = auth.uid());
