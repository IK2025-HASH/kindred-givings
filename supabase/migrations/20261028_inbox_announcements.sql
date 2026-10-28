-- ============================================================
-- Inbox / Announcements feature
-- ============================================================

-- Platform-wide announcements (admin posts to all orgs or specific orgs)
CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience    text NOT NULL DEFAULT 'all', -- 'all' or a specific org_id
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read announcements
CREATE POLICY "authenticated users read announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (audience = 'all');

-- Platform admins can manage announcements
CREATE POLICY "platform admins manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL   ON public.announcements TO service_role;

-- Internal messages between org members
CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  body            text NOT NULL,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Org members in the same org can see messages sent/received within that org
CREATE POLICY "org members read own messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    (from_user_id = auth.uid() OR to_user_id = auth.uid())
    AND public.is_org_member(auth.uid(), organization_id)
  );

CREATE POLICY "org members send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND public.is_org_member(auth.uid(), organization_id)
    AND public.is_org_member(to_user_id, organization_id)
  );

CREATE POLICY "recipient marks read"
  ON public.messages FOR UPDATE TO authenticated
  USING (to_user_id = auth.uid())
  WITH CHECK (to_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
