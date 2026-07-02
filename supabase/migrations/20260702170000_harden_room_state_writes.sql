-- Route all room-state mutation through service-role server endpoints.
-- Public clients may still create rooms and read public room state for realtime,
-- but they must not update/delete rooms or read host_secret.

DROP POLICY IF EXISTS "rooms_all" ON public.rooms;
DROP POLICY IF EXISTS "rooms_public_select" ON public.rooms;
DROP POLICY IF EXISTS "rooms_public_insert" ON public.rooms;

REVOKE SELECT, UPDATE, DELETE ON public.rooms FROM anon, authenticated;
GRANT SELECT (id, code, state, created_at, updated_at) ON public.rooms TO anon, authenticated;
GRANT INSERT (code, host_secret, state) ON public.rooms TO anon, authenticated;

CREATE POLICY "rooms_public_select" ON public.rooms
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "rooms_public_insert" ON public.rooms
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "submissions_all" ON public.submissions;
DROP POLICY IF EXISTS "votes_all" ON public.votes;
DROP POLICY IF EXISTS "challenges_all" ON public.challenges;
DROP POLICY IF EXISTS photos_all ON public.photos;

CREATE POLICY "submissions_public_select" ON public.submissions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "votes_public_select" ON public.votes
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "challenges_public_select" ON public.challenges
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "photos_public_select" ON public.photos
FOR SELECT
TO anon, authenticated
USING (true);

-- Artifact rows are still readable for realtime host/player views, but all
-- mutation now goes through service-role server endpoints.
REVOKE INSERT, UPDATE, DELETE ON public.submissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.votes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.challenges FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.photos FROM anon, authenticated;

-- Media uploads/read access are mediated by signed Storage URLs minted by
-- service-role endpoints after room/player validation.
DROP POLICY IF EXISTS "recordings_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "recordings_anon_select" ON storage.objects;
