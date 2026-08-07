-- Phase 0 through Phase 4 Comprehensive Database Schema Migration

-- 1. Create Settings table
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    business_name TEXT NOT NULL DEFAULT 'Campaign Companion',
    postal_address TEXT NOT NULL DEFAULT '123 Business Street, Tech Park, Mumbai, MH 400001, India',
    support_email TEXT NOT NULL DEFAULT 'support@example.com',
    sender_domain TEXT NOT NULL DEFAULT 'example.com',
    daily_cap INTEGER NOT NULL DEFAULT 100,
    monthly_cap INTEGER NOT NULL DEFAULT 3000,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    throttle_pause_ms INTEGER NOT NULL DEFAULT 1100,
    owner_password_hash TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO public.settings (id, business_name, postal_address, support_email, sender_domain, daily_cap, monthly_cap, timezone, throttle_pause_ms)
VALUES ('default', 'Campaign Companion', '123 Business Street, Tech Park, Mumbai, MH 400001, India', 'support@example.com', 'example.com', 100, 3000, 'Asia/Kolkata', 1100)
ON CONFLICT (id) DO NOTHING;

-- 2. Create Audit Logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Events table (Unsubscribe, Bounce, Complaint tracking)
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'unsubscribe', 'bounce', 'complaint', 'open', 'click'
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Extend Leads table for DPDP consent and suppression
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS consent_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS consent_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS consent_note TEXT DEFAULT 'Direct opt-in consent',
ADD COLUMN IF NOT EXISTS suppression_status TEXT DEFAULT 'active', -- 'active', 'unsubscribed', 'bounced', 'complained', 'manually_suppressed'
ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ;

-- 5. Extend Campaigns table for body_text, scheduling, and approval state
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS body_text TEXT,
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by TEXT,
ADD COLUMN IF NOT EXISTS recipient_count INTEGER DEFAULT 0;

-- Update status check constraint on campaigns
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check 
CHECK (status IN ('draft', 'approved', 'scheduled', 'queued', 'sending', 'completed', 'cancelled'));

-- 6. Extend Sends table for delivery tracking
ALTER TABLE public.sends
ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
ADD COLUMN IF NOT EXISTS attempt_history JSONB DEFAULT '[]'::jsonb;

-- 7. Enable RLS and default policies
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Allow public read access to audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public read access to events" ON public.events FOR SELECT USING (true);
