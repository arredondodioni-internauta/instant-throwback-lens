
GRANT SELECT ON public.reactions TO anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;

CREATE POLICY "Read reactions for published albums"
  ON public.reactions FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = reactions.event_id
      AND e.album_published_at IS NOT NULL
      AND (e.album_expires_at IS NULL OR e.album_expires_at > now())
  ));

CREATE POLICY "Read comments for published albums"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = comments.event_id
      AND e.album_published_at IS NOT NULL
      AND (e.album_expires_at IS NULL OR e.album_expires_at > now())
  ));
