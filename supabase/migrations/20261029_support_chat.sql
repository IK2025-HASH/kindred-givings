-- ============================================================
-- Support chat: conversations and messages
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  started_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name      TEXT,
  body             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS support_conversations_org_id_idx       ON public.support_conversations(org_id);
CREATE INDEX IF NOT EXISTS support_conversations_started_by_idx   ON public.support_conversations(started_by);
CREATE INDEX IF NOT EXISTS support_conversations_status_idx       ON public.support_conversations(status);
CREATE INDEX IF NOT EXISTS support_messages_conversation_id_idx   ON public.support_messages(conversation_id);

-- RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages      ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access to all conversations and messages
DROP POLICY IF EXISTS "admins manage conversations" ON public.support_conversations;
CREATE POLICY "admins manage conversations" ON public.support_conversations
  FOR ALL TO authenticated
  USING  (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "admins manage messages" ON public.support_messages;
CREATE POLICY "admins manage messages" ON public.support_messages
  FOR ALL TO authenticated
  USING  (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Users: insert their own conversations
DROP POLICY IF EXISTS "users open conversations" ON public.support_conversations;
CREATE POLICY "users open conversations" ON public.support_conversations
  FOR INSERT TO authenticated
  WITH CHECK (started_by = auth.uid());

-- Users: read their own conversations
DROP POLICY IF EXISTS "users read own conversations" ON public.support_conversations;
CREATE POLICY "users read own conversations" ON public.support_conversations
  FOR SELECT TO authenticated
  USING (started_by = auth.uid());

-- Users: insert messages into their own conversations
DROP POLICY IF EXISTS "users send messages" ON public.support_messages;
CREATE POLICY "users send messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.started_by = auth.uid()
    )
  );

-- Users: read messages from their own conversations
DROP POLICY IF EXISTS "users read own messages" ON public.support_messages;
CREATE POLICY "users read own messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.started_by = auth.uid()
    )
  );

GRANT ALL ON public.support_conversations TO authenticated;
GRANT ALL ON public.support_messages      TO authenticated;
GRANT ALL ON public.support_conversations TO service_role;
GRANT ALL ON public.support_messages      TO service_role;
