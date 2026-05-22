
-- Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  shots_per_guest INTEGER NOT NULL DEFAULT 5 CHECK (shots_per_guest > 0 AND shots_per_guest <= 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX events_host_id_idx ON public.events(host_id);
CREATE INDEX events_code_idx ON public.events(code);

-- Guests table
CREATE TABLE public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  device_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX guests_event_id_idx ON public.guests(event_id);
CREATE INDEX guests_device_token_idx ON public.guests(device_token);

-- Photos table
CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX photos_event_id_idx ON public.photos(event_id);
CREATE INDEX photos_guest_id_idx ON public.photos(guest_id);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- Events: hosts manage their own events
CREATE POLICY "Hosts can view their own events" ON public.events
  FOR SELECT USING (auth.uid() = host_id);
CREATE POLICY "Hosts can insert their own events" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can update their own events" ON public.events
  FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Hosts can delete their own events" ON public.events
  FOR DELETE USING (auth.uid() = host_id);

-- Guests: only hosts can read; writes happen via server function (admin client)
CREATE POLICY "Hosts can view guests of their events" ON public.guests
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND e.host_id = auth.uid()
  ));

-- Photos: only hosts can read; writes happen via server function (admin client)
CREATE POLICY "Hosts can view photos of their events" ON public.photos
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = photos.event_id AND e.host_id = auth.uid()
  ));

-- Storage bucket for event photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', false);

-- Only hosts can list/read their event photos via storage RLS (downloads use signed URLs server-side anyway)
CREATE POLICY "Hosts can read their event photo objects" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'event-photos'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.host_id = auth.uid()
      AND (storage.foldername(name))[1] = e.id::text
    )
  );
