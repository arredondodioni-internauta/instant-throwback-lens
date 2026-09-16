-- Links a push subscription (album_viewers) to the live guest that registered it,
-- so the camera-reminder job can find "this guest's subscription" directly.
ALTER TABLE public.album_viewers
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS album_viewers_guest_id_idx ON public.album_viewers(guest_id);

-- Idempotency marker: set once the camera reminder has been sent for a guest.
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS camera_reminder_sent_at timestamptz;

-- Idempotency marker for the 30-second test tier (see sendCameraReminderPushes
-- in push.server.ts). TODO: drop this column once the 1h reminder is confirmed
-- working end-to-end in production.
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS camera_reminder_test_sent_at timestamptz;

-- Sized for the reminder job's query (only unreminded guests matter).
CREATE INDEX IF NOT EXISTS guests_reminder_pending_idx
  ON public.guests (created_at)
  WHERE camera_reminder_sent_at IS NULL OR camera_reminder_test_sent_at IS NULL;

-- Scheduling: pg_cron calls pg_net, which POSTs to this app's own cron endpoint
-- every 5 minutes. The endpoint reuses the app's existing Node/VAPID push code
-- directly, so nothing needs to be ported to a separate Deno Edge Function.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- The cron secret and target URL are stored in Vault rather than inline here.
-- After this migration runs, set them once from the SQL editor (not committed to git):
--
--   select vault.create_secret('<CRON_SECRET_VALUE>', 'camera_reminder_cron_secret');
--   select vault.create_secret('https://<production-domain>/api/cron/camera-reminders', 'camera_reminder_cron_url');
--
-- Then schedule the job:
--
--   select cron.schedule(
--     'camera-reminder-push',
--     '*/5 * * * *',  -- use '* * * * *' (every minute) while testing the 30s tier
--     $$
--     select net.http_post(
--       url := (select decrypted_secret from vault.decrypted_secrets where name = 'camera_reminder_cron_url'),
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'camera_reminder_cron_secret')
--       ),
--       body := '{}'::jsonb
--     );
--     $$
--   );
