
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS album_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS album_expires_at timestamptz;

CREATE TABLE public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewer_token uuid NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('😂','🥹','🔥','👏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id, viewer_token)
);
GRANT ALL ON public.reactions TO service_role;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX reactions_event_idx ON public.reactions(event_id);
CREATE INDEX reactions_photo_idx ON public.reactions(photo_id);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewer_token uuid NOT NULL,
  nickname text NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 140),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX comments_event_idx ON public.comments(event_id);
CREATE INDEX comments_photo_idx ON public.comments(photo_id);

CREATE TABLE public.album_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewer_token uuid NOT NULL,
  nickname text,
  push_subscription jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, viewer_token)
);
GRANT ALL ON public.album_viewers TO service_role;
ALTER TABLE public.album_viewers ENABLE ROW LEVEL SECURITY;
CREATE INDEX album_viewers_event_idx ON public.album_viewers(event_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
