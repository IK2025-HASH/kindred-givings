-- ============================================================
-- Fix 1: Enable inbox feature for Starter plan
-- The message centre (Inbox / Sent / Announcements) should be
-- available to all plans including the free Starter tier.
-- ============================================================

UPDATE public.plan_features
SET    is_enabled = true
WHERE  feature_id = (SELECT id FROM public.features WHERE key = 'inbox')
  AND  plan_id    = (SELECT id FROM public.plans    WHERE slug = 'starter');

-- ============================================================
-- Fix 2: RLS for chat support agents on support tables
-- Previously only platform admins could read conversations.
-- Agents need to read open/assigned conversations and reply.
-- ============================================================

-- Agents: read open (unassigned) or their own assigned conversations
DROP POLICY IF EXISTS "agents read conversations" ON public.support_conversations;
CREATE POLICY "agents read conversations" ON public.support_conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_support_agents a
      WHERE a.user_id = auth.uid()
    )
    AND (
      status IN ('open', 'assigned')
    )
  );

-- Agents: update conversations assigned to them (e.g. close/update status)
DROP POLICY IF EXISTS "agents update assigned conversations" ON public.support_conversations;
CREATE POLICY "agents update assigned conversations" ON public.support_conversations
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_support_agents a
      WHERE a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_support_agents a
      WHERE a.user_id = auth.uid()
    )
  );

-- Agents: read messages in conversations they can access
DROP POLICY IF EXISTS "agents read messages" ON public.support_messages;
CREATE POLICY "agents read messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_support_agents a
      WHERE a.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND c.status IN ('open', 'assigned')
    )
  );

-- Agents: send messages in conversations assigned to them (or open ones)
DROP POLICY IF EXISTS "agents send messages" ON public.support_messages;
CREATE POLICY "agents send messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_support_agents a
      WHERE a.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND c.status IN ('open', 'assigned')
    )
  );
