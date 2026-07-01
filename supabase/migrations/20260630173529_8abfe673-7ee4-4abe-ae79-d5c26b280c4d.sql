CREATE TABLE public.photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL,
  round_id text NOT NULL,
  player_id text NOT NULL,
  player_name text NOT NULL,
  team_id text NOT NULL,
  photo_url text NOT NULL,
  rank integer,
  ai_comment text,
  points integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO anon, authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY photos_all ON public.photos FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.photos;