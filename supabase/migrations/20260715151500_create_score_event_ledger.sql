-- Append-only scoring audit. Direct clients cannot read or write this table;
-- the service-role RPC below atomically inserts events and materializes totals
-- into rooms.state->teams for the existing realtime UI.
CREATE TABLE public.score_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  act_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_id TEXT,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT score_events_identifier_lengths CHECK (
    char_length(run_id) BETWEEN 2 AND 100
    AND char_length(game_id) BETWEEN 2 AND 100
    AND char_length(act_id) BETWEEN 2 AND 100
    AND char_length(team_id) BETWEEN 2 AND 100
    AND (player_id IS NULL OR char_length(player_id) BETWEEN 2 AND 100)
    AND char_length(idempotency_key) BETWEEN 8 AND 128
  ),
  CONSTRAINT score_events_identifier_characters CHECK (
    run_id ~ '^[A-Za-z0-9:_-]+$'
    AND game_id ~ '^[A-Za-z0-9:_-]+$'
    AND act_id ~ '^[A-Za-z0-9:_-]+$'
    AND team_id ~ '^[A-Za-z0-9:_-]+$'
    AND (player_id IS NULL OR player_id ~ '^[A-Za-z0-9:_-]+$')
    AND idempotency_key ~ '^[A-Za-z0-9:_-]+$'
  ),
  CONSTRAINT score_events_points_check CHECK (
    points <> 0 AND points BETWEEN -1000000 AND 1000000
  ),
  CONSTRAINT score_events_reason_check CHECK (char_length(reason) BETWEEN 2 AND 240),
  CONSTRAINT score_events_source_check CHECK (
    source IN ('vote', 'deterministic', 'ai-bonus', 'host-adjustment', 'legacy')
  ),
  CONSTRAINT score_events_rubric_object CHECK (jsonb_typeof(rubric) = 'object'),
  CONSTRAINT score_events_rubric_size CHECK (octet_length(rubric::text) <= 16384),
  CONSTRAINT score_events_room_idempotency_key UNIQUE (room_id, idempotency_key)
);

CREATE INDEX score_events_room_created_idx
  ON public.score_events (room_id, created_at);
CREATE INDEX score_events_room_run_idx
  ON public.score_events (room_id, run_id, created_at);
CREATE INDEX score_events_room_act_idx
  ON public.score_events (room_id, act_id, created_at);
CREATE INDEX score_events_room_team_idx
  ON public.score_events (room_id, team_id, created_at);
CREATE INDEX score_events_room_player_idx
  ON public.score_events (room_id, player_id, created_at)
  WHERE player_id IS NOT NULL;

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.score_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.score_events TO service_role;

COMMENT ON TABLE public.score_events IS
  'Server-only append-only scoring ledger and finale source of truth.';

CREATE OR REPLACE FUNCTION public.award_score_events(
  p_room_id UUID,
  p_events JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_state JSONB;
  v_updated_at TIMESTAMPTZ;
  v_team JSONB;
  v_teams JSONB;
  v_team_totals JSONB;
  v_event JSONB;
  v_rubric JSONB;
  v_existing public.score_events%ROWTYPE;
  v_inserted public.score_events%ROWTYPE;
  v_act_id TEXT;
  v_team_id TEXT;
  v_player_id TEXT;
  v_key TEXT;
  v_run_id TEXT;
  v_game_id TEXT;
  v_reason TEXT;
  v_source TEXT;
  v_points INTEGER;
  v_current_score INTEGER;
  v_ledger_score BIGINT;
  v_delta BIGINT;
  v_added_by_team JSONB := '{}'::jsonb;
  v_event_results JSONB := '[]'::jsonb;
  v_inserted_count INTEGER := 0;
  v_replayed_count INTEGER := 0;
  v_legacy_count INTEGER := 0;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score events must be an array';
  END IF;
  IF jsonb_array_length(p_events) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too many score events';
  END IF;

  SELECT state, updated_at
    INTO v_state, v_updated_at
    FROM public.rooms
   WHERE id = p_room_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'room not found';
  END IF;
  IF jsonb_typeof(v_state->'teams') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'room teams are invalid';
  END IF;

  -- Existing games still write totals directly. Before every ledger operation,
  -- record only the drift so their history remains visible as classic/legacy.
  FOR v_team IN SELECT value FROM jsonb_array_elements(v_state->'teams')
  LOOP
    v_team_id := v_team->>'id';
    IF v_team_id IS NULL OR COALESCE(v_team->>'score', '') !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'room team score is invalid';
    END IF;
    v_current_score := (v_team->>'score')::INTEGER;
    SELECT COALESCE(SUM(points), 0)
      INTO v_ledger_score
      FROM public.score_events
     WHERE room_id = p_room_id AND team_id = v_team_id;
    v_delta := v_current_score::BIGINT - v_ledger_score;

    IF v_delta <> 0 THEN
      IF v_delta < -1000000 OR v_delta > 1000000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'legacy score drift is too large';
      END IF;
      v_key := 'legacy:' || md5(
        p_room_id::TEXT || ':' || v_team_id || ':' || v_updated_at::TEXT || ':' || v_delta::TEXT
      );
      INSERT INTO public.score_events (
        room_id,
        run_id,
        game_id,
        act_id,
        team_id,
        points,
        reason,
        source,
        rubric,
        idempotency_key
      ) VALUES (
        p_room_id,
        'legacy:' || substr(md5(v_updated_at::TEXT), 1, 24),
        'classic',
        'classic',
        v_team_id,
        v_delta::INTEGER,
        'Legacy score state reconciliation',
        'legacy',
        jsonb_build_object('migrated', true, 'roomUpdatedAt', v_updated_at),
        v_key
      )
      ON CONFLICT (room_id, idempotency_key) DO NOTHING;
      IF FOUND THEN
        v_legacy_count := v_legacy_count + 1;
      END IF;
    END IF;
  END LOOP;

  v_act_id := COALESCE(NULLIF(v_state#>>'{party,actId}', ''), 'classic');

  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF jsonb_typeof(v_event) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score event must be an object';
    END IF;

    v_key := btrim(COALESCE(v_event->>'idempotencyKey', ''));
    v_run_id := btrim(COALESCE(v_event->>'runId', ''));
    v_game_id := btrim(COALESCE(v_event->>'gameId', ''));
    v_team_id := btrim(COALESCE(v_event->>'teamId', ''));
    v_player_id := NULLIF(btrim(COALESCE(v_event->>'playerId', '')), '');
    v_reason := btrim(COALESCE(v_event->>'reason', ''));
    v_source := btrim(COALESCE(v_event->>'source', ''));
    v_rubric := COALESCE(v_event->'rubric', '{}'::jsonb);

    IF COALESCE(v_event->>'points', '') !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score points must be an integer';
    END IF;
    v_points := (v_event->>'points')::INTEGER;
    IF v_points = 0 OR v_points < -1000000 OR v_points > 1000000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score points are out of range';
    END IF;
    IF v_source NOT IN ('vote', 'deterministic', 'ai-bonus', 'host-adjustment') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score source is invalid';
    END IF;
    IF jsonb_typeof(v_rubric) <> 'object' OR octet_length(v_rubric::TEXT) > 16384 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score rubric is invalid';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_state->'teams') AS team
       WHERE team->>'id' = v_team_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'score team not found';
    END IF;
    IF v_player_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(COALESCE(v_state->'players', '[]'::jsonb)) AS player
       WHERE player->>'id' = v_player_id AND player->>'teamId' = v_team_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'score player does not belong to team';
    END IF;

    SELECT *
      INTO v_existing
      FROM public.score_events
     WHERE room_id = p_room_id AND idempotency_key = v_key;

    IF FOUND THEN
      IF v_existing.run_id IS DISTINCT FROM v_run_id
        OR v_existing.game_id IS DISTINCT FROM v_game_id
        OR v_existing.team_id IS DISTINCT FROM v_team_id
        OR v_existing.player_id IS DISTINCT FROM v_player_id
        OR v_existing.points IS DISTINCT FROM v_points
        OR v_existing.reason IS DISTINCT FROM v_reason
        OR v_existing.source IS DISTINCT FROM v_source
        OR v_existing.rubric IS DISTINCT FROM v_rubric
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'score idempotency key belongs to another event';
      END IF;
      v_replayed_count := v_replayed_count + 1;
      v_event_results := v_event_results || jsonb_build_array(
        to_jsonb(v_existing) || jsonb_build_object('replayed', true)
      );
    ELSE
      INSERT INTO public.score_events (
        room_id,
        run_id,
        game_id,
        act_id,
        team_id,
        player_id,
        points,
        reason,
        source,
        rubric,
        idempotency_key
      ) VALUES (
        p_room_id,
        v_run_id,
        v_game_id,
        v_act_id,
        v_team_id,
        v_player_id,
        v_points,
        v_reason,
        v_source,
        v_rubric,
        v_key
      )
      RETURNING * INTO v_inserted;

      v_inserted_count := v_inserted_count + 1;
      v_added_by_team := jsonb_set(
        v_added_by_team,
        ARRAY[v_team_id],
        to_jsonb(COALESCE((v_added_by_team->>v_team_id)::INTEGER, 0) + v_points),
        true
      );
      v_event_results := v_event_results || jsonb_build_array(
        to_jsonb(v_inserted) || jsonb_build_object('replayed', false)
      );
    END IF;
  END LOOP;

  IF v_inserted_count > 0 THEN
    SELECT jsonb_agg(
      CASE
        WHEN v_added_by_team ? (team->>'id') THEN jsonb_set(
          team,
          '{score}',
          to_jsonb((team->>'score')::INTEGER + (v_added_by_team->>(team->>'id'))::INTEGER),
          false
        )
        ELSE team
      END
      ORDER BY ordinal
    )
      INTO v_teams
      FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS entries(team, ordinal);

    v_state := jsonb_set(v_state, '{teams}', v_teams, false);
    UPDATE public.rooms SET state = v_state WHERE id = p_room_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('teamId', team->>'id', 'score', (team->>'score')::INTEGER)
      ORDER BY ordinal
    ),
    '[]'::jsonb
  )
    INTO v_team_totals
    FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS entries(team, ordinal);

  RETURN jsonb_build_object(
    'insertedCount', v_inserted_count,
    'replayedCount', v_replayed_count,
    'materializedLegacyCount', v_legacy_count,
    'events', v_event_results,
    'teamTotals', v_team_totals
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.award_score_events(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_score_events(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.award_score_events(UUID, JSONB) IS
  'Atomically deduplicates score events, reconciles legacy totals and updates room team scores.';
