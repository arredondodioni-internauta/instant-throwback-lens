-- 1) Fix broken storage policy on event-photos bucket
DROP POLICY IF EXISTS "Hosts can read their event photo objects" ON storage.objects;

CREATE POLICY "Hosts can read their event photo objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'event-photos'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.host_id = auth.uid()
      AND (storage.foldername(objects.name))[1] = e.id::text
  )
);

-- 2) Prevent hosts (or any signed-in user) from reading guest device_token
REVOKE SELECT (device_token) ON public.guests FROM anon, authenticated;