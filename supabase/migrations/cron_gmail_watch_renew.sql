-- ============================================================
-- Gmail Watch Auto-Renewal Cron Job
-- ============================================================
-- Gmail watches expire every ~7 days. This cron job calls the
-- gmail-watch-renew edge function every 5 days to keep them alive.
--
-- SETUP:
-- 1. Deploy the edge function first:
--    npx supabase functions deploy gmail-watch-renew --no-verify-jwt
--
-- 2. Replace YOUR_SERVICE_ROLE_KEY below with your actual service role key
--    (found in Supabase Dashboard > Settings > API > service_role key)
--
-- 3. Run this SQL in the Supabase SQL Editor.
-- ============================================================

-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule: At 3:00 AM UTC every 5 days
select cron.schedule(
  'renew-gmail-watches',
  '0 3 */5 * *',
  $$
  select net.http_post(
    url := 'https://xjyjbspwtqkykmwzqjew.supabase.co/functions/v1/gmail-watch-renew',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify: select * from cron.job;
-- Remove: select cron.unschedule('renew-gmail-watches');
