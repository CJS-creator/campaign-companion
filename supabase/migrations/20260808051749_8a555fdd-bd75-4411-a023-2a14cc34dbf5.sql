ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sends ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_email_key ON public.leads (user_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unassigned_key ON public.leads (email) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS leads_user_id_idx ON public.leads (user_id);
CREATE INDEX IF NOT EXISTS campaigns_user_id_idx ON public.campaigns (user_id);
CREATE INDEX IF NOT EXISTS sends_user_id_idx ON public.sends (user_id);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON public.events (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);