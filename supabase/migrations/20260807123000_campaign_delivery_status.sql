ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'sending', 'sent'));

ALTER TABLE public.sends
  ADD COLUMN status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN failure_reason TEXT,
  ADD COLUMN last_attempt_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_sends_campaign_status ON public.sends(campaign_id, status);
