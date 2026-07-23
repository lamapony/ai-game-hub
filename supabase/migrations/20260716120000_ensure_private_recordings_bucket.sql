-- Repair drift when the historical bucket migration is recorded but the bucket
-- was deleted or made public later. Media access remains server-mediated via
-- short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false;

-- Reassert the server-only boundary even if an old policy was restored after
-- the original hardening migration.
DROP POLICY IF EXISTS "recordings_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "recordings_anon_select" ON storage.objects;
