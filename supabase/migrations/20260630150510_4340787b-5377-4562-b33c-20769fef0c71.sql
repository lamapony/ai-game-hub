
CREATE POLICY "recordings_anon_select" ON storage.objects FOR SELECT
TO anon, authenticated USING (bucket_id = 'recordings');

CREATE POLICY "recordings_anon_insert" ON storage.objects FOR INSERT
TO anon, authenticated WITH CHECK (bucket_id = 'recordings');
