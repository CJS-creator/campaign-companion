CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('drain-campaign-queue') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-campaign-queue');

SELECT cron.schedule(
  'drain-campaign-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f9328437-7e6a-4232-b6bc-aaa83f497f5c.lovable.app/api/public/cron/process-queue',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_ORRoV5eVwS86nxF9W15Gaw_cw-iQIko"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);