-- 1. Sends: delivery tracking
ALTER TABLE public.sends
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_history JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.sends SET status = 'sent' WHERE sent_at IS NOT NULL AND status = 'queued';

ALTER TABLE public.sends DROP CONSTRAINT IF EXISTS sends_status_check;
ALTER TABLE public.sends ADD CONSTRAINT sends_status_check
  CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped'));
ALTER TABLE public.sends DROP CONSTRAINT IF EXISTS sends_attempt_count_check;
ALTER TABLE public.sends ADD CONSTRAINT sends_attempt_count_check CHECK (attempt_count >= 0);

CREATE INDEX IF NOT EXISTS idx_sends_campaign_status ON public.sends(campaign_id, status);

-- 2. Campaigns: text body, scheduling, approval
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS recipient_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'approved', 'scheduled', 'queued', 'sending', 'sent', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON public.campaigns(status, scheduled_for);

-- 3. Leads: consent + suppression
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS consent_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS consent_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS consent_note TEXT,
  ADD COLUMN IF NOT EXISTS suppression_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
  ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_suppression_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_suppression_status_check
  CHECK (suppression_status IN ('active', 'unsubscribed', 'bounced', 'complained', 'manually_suppressed'));

CREATE INDEX IF NOT EXISTS idx_leads_subscribed ON public.leads(subscribed, suppression_status);

-- 4. Settings
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  business_name TEXT NOT NULL DEFAULT '',
  postal_address TEXT NOT NULL DEFAULT '',
  support_email TEXT NOT NULL DEFAULT '',
  sender_domain TEXT NOT NULL DEFAULT '',
  from_address TEXT NOT NULL DEFAULT 'onboarding@resend.dev',
  daily_cap INTEGER NOT NULL DEFAULT 100,
  monthly_cap INTEGER NOT NULL DEFAULT 3000,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  throttle_pause_ms INTEGER NOT NULL DEFAULT 1100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.settings TO anon;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access to settings" ON public.settings;
CREATE POLICY "Public access to settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 5. Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO anon;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access to audit_logs" ON public.audit_logs;
CREATE POLICY "Public access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- 6. Events
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  send_id UUID REFERENCES public.sends(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.events TO authenticated;
GRANT SELECT, INSERT ON public.events TO anon;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access to events" ON public.events;
CREATE POLICY "Public access to events" ON public.events FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_events_campaign ON public.events(campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_lead ON public.events(lead_id, event_type);

-- 7. Atomic batch claim for the sending worker
CREATE OR REPLACE FUNCTION public.claim_queued_sends(p_campaign_id UUID, p_batch_size INTEGER)
RETURNS TABLE (id UUID, lead_id UUID, attempt_count INTEGER, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT s.id
    FROM public.sends s
    WHERE s.campaign_id = p_campaign_id
      AND s.status IN ('queued', 'failed')
      AND s.attempt_count < 3
    ORDER BY s.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE public.sends s
  SET status = 'sending', last_attempt_at = now()
  FROM claimed c
  WHERE s.id = c.id
  RETURNING s.id, s.lead_id, s.attempt_count, s.status;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_queued_sends(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_queued_sends(UUID, INTEGER) TO service_role;