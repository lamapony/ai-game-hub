-- Private bucket for Soundscape audio, Challenge video, and Photo Hunt uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;
