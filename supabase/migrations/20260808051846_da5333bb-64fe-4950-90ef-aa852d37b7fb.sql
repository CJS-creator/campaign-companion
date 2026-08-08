DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'campaign_worker_key') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'campaign_worker_key', 'Shared key for the campaign queue worker endpoint');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_worker_key(p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'campaign_worker_key';
  IF v_secret IS NULL OR p_key IS NULL OR length(p_key) = 0 THEN
    RETURN false;
  END IF;
  RETURN v_secret = p_key;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_worker_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_worker_key(text) TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE command LIKE '%process-queue%';

SELECT cron.schedule(
  'campaign-queue-worker',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--f9328437-7e6a-4232-b6bc-aaa83f497f5c.lovable.app/api/public/cron/process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'campaign_worker_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);