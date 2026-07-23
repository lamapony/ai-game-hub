-- Bind every private record to the party session that authorized its write.
-- This remains correct when an upload/provider request finishes after New party:
-- created_at may be new, but the captured session identity is still the old one.
ALTER TABLE public.party_records
  ADD COLUMN session_started_at BIGINT NOT NULL DEFAULT 0;

-- Preserve records from the currently active session during an additive deploy.
-- Older records stay in legacy session 0 and cannot enter the current session window.
UPDATE public.party_records AS party_record
SET session_started_at = (room.state #>> '{party,sessionStartedAt}')::BIGINT
FROM public.rooms AS room
WHERE party_record.room_id = room.id
  AND room.state #>> '{party,sessionStartedAt}' ~ '^[0-9]+$'
  AND party_record.created_at >= to_timestamp(
    ((room.state #>> '{party,sessionStartedAt}')::NUMERIC) / 1000
  );

CREATE INDEX party_records_room_session_run_idx
  ON public.party_records (room_id, session_started_at, run_id, created_at);

COMMENT ON COLUMN public.party_records.session_started_at IS
  'Server-captured RoomState.party.sessionStartedAt; 0 is the legacy/classic session.';
