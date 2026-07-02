-- Room state is now mutated through server endpoints with the service role.
-- Keep public room creation and reads for QR-code guests, but stop anonymous
-- clients from updating/deleting rooms or reading host_secret.

DROP POLICY IF EXISTS "rooms_all" ON public.rooms;

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
