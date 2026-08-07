-- 1) Security toggles used by the sending worker
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS enforce_caps BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_link_check BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_url_shorteners BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_suppress_bounces BOOLEAN NOT NULL DEFAULT true;

-- 2) Drop permissive world-open policies
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('leads','campaigns','sends','settings','audit_logs','events')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 3) Enforce RLS and remove Data API reach for anon / authenticated.
--    All access flows through server-side code using the service role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','campaigns','sends','settings','audit_logs','events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;