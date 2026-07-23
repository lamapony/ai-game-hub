-- Private cross-act party memory. This table is deliberately absent from
-- supabase_realtime and has no anon/authenticated policies or grants.
CREATE TABLE public.party_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  act_id TEXT NOT NULL,
  owner_player_id TEXT,
  owner_team_id TEXT,
  kind TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'player',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revealed_at TIMESTAMPTZ,

  CONSTRAINT party_records_one_owner CHECK (
    owner_player_id IS NULL OR owner_team_id IS NULL
  ),
  CONSTRAINT party_records_player_owner_check CHECK (
    visibility <> 'player' OR owner_player_id IS NOT NULL OR owner_team_id IS NOT NULL
  ),
  CONSTRAINT party_records_identifier_lengths CHECK (
    char_length(run_id) BETWEEN 2 AND 100
    AND char_length(game_id) BETWEEN 2 AND 100
    AND char_length(kind) BETWEEN 2 AND 100
    AND char_length(idempotency_key) BETWEEN 8 AND 128
  ),
  CONSTRAINT party_records_visibility_check CHECK (
    visibility IN ('player', 'host', 'sealed', 'revealed')
  ),
  CONSTRAINT party_records_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT party_records_payload_size CHECK (octet_length(payload::text) <= 65536),
  CONSTRAINT party_records_reveal_time_check CHECK (
    (visibility = 'revealed' AND revealed_at IS NOT NULL)
    OR (visibility <> 'revealed' AND revealed_at IS NULL)
  ),
  CONSTRAINT party_records_room_idempotency_key UNIQUE (room_id, idempotency_key)
);

CREATE INDEX party_records_room_run_idx
  ON public.party_records (room_id, run_id, created_at);
CREATE INDEX party_records_player_idx
  ON public.party_records (room_id, owner_player_id, created_at)
  WHERE owner_player_id IS NOT NULL;
CREATE INDEX party_records_team_idx
  ON public.party_records (room_id, owner_team_id, created_at)
  WHERE owner_team_id IS NOT NULL;
CREATE INDEX party_records_visibility_idx
  ON public.party_records (room_id, visibility, created_at);

ALTER TABLE public.party_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.party_records FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.party_records TO service_role;

COMMENT ON TABLE public.party_records IS
  'Server-only missions, prophecies, testimony and other private party memory.';
