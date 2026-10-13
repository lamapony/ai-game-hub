import assert from "node:assert/strict";
import { ORACLE_RECORD_KIND, ORACLE_VERDICT_RECORD_KIND } from "@/games/grilloracle/model";
import {
  SMOKE_SCREEN_MISSION_KIND,
  SMOKE_SCREEN_REVEAL_KIND,
  SMOKE_SCREEN_RESULT_KIND,
} from "@/games/smokescreen/model";
import type { PartyRecordRow } from "../party-records";
import { verifyOraclePredictions } from "../grilloracle-lifecycle.server";
import { currentPartyRecordFilters, listPartyRecordsForPlayer } from "../party-records.server";
import { finalizeSmokeScreenRun, revealSmokeScreenRun } from "../smokescreen.server";
import { emptyRoomState, type RoomState } from "../types";

async function verifyRevealedRecordSession() {
  const session = Date.parse("2026-10-13T00:00:00Z");
  const players = ["player_1", "player_2"].map((id) => ({
    id,
    name: id,
    teamId: "forest",
    joinedAt: session,
  }));
  let state: RoomState = {
    ...emptyRoomState("Host"),
    players,
    party: { ...emptyRoomState("Host").party!, sessionStartedAt: session, aiMode: "manual" },
    smokescreen: {
      runId: "smoke_session",
      status: "sealed" as const,
      participantIds: players.map((player) => player.id),
      assignedPlayerIds: players.map((player) => player.id),
      submittedVoterIds: [],
      startedAt: session,
    },
  };
  const rows: PartyRecordRow[] = players.map((player, index) => ({
    id: `mission_${index}`,
    room_id: "room_session",
    run_id: "smoke_session",
    game_id: "smokescreen",
    act_id: "classic",
    owner_player_id: player.id,
    owner_team_id: null,
    kind: SMOKE_SCREEN_MISSION_KIND,
    visibility: "sealed",
    payload: {
      version: 1,
      mission: { tier: 1, text: `Mission ${index}`, detection_hint: "Watch the glasses" },
      assignedAt: session,
    },
    idempotency_key: `assignment_${index}`,
    created_at: new Date(session + 1).toISOString(),
    revealed_at: null,
    session_started_at: session,
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/rest/v1/rooms")) {
      if (init?.method === "PATCH") state = JSON.parse(String(init.body)).state;
      return Response.json([
        { id: "room_session", state, updated_at: new Date(session).toISOString() },
      ]);
    }
    if (!url.pathname.endsWith("/rest/v1/party_records")) {
      throw new Error("Unexpected request in Smoke Screen session test");
    }
    if (init?.method === "POST") {
      const inserted = {
        id: `reveal_${rows.length}`,
        created_at: new Date(session + 1000).toISOString(),
        session_started_at: 0, // The database default must not become the reveal's session.
        ...JSON.parse(String(init.body)),
      } as PartyRecordRow;
      rows.push(inserted);
      return Response.json([inserted]);
    }
    const matching = rows.filter((row) =>
      ["idempotency_key", "run_id", "kind", "session_started_at"].every((key) => {
        const expected = url.searchParams.get(key);
        return !expected || expected === `eq.${row[key as keyof PartyRecordRow]}`;
      }),
    );
    return Response.json(matching);
  }) as typeof fetch;
  try {
    await revealSmokeScreenRun({
      room: { id: "room_session", code: "TEST", state, updatedAt: new Date(session).toISOString() },
      runId: "smoke_session",
      now: session + 1000,
    });
    const records = await listPartyRecordsForPlayer(
      "room_session",
      players[0]!,
      currentPartyRecordFilters(state, { runId: "smoke_session" }),
    );
    const reveals = records.filter((record) => record.kind === SMOKE_SCREEN_REVEAL_KIND);
    assert.equal(reveals.length, players.length);
    assert.ok(reveals.every((record) => record.ownerPlayerId === undefined));
    assert.ok(reveals.every((record) => !record.payloadRedacted));
    const ownSealedMission = records.find((record) => record.kind === SMOKE_SCREEN_MISSION_KIND);
    assert.equal(ownSealedMission?.payloadRedacted, true);
    assert.equal(ownSealedMission?.payload, undefined);
    state.smokescreen!.submittedVoterIds = [players[0]!.id];
    await finalizeSmokeScreenRun({
      room: { id: "room_session", code: "TEST", state, updatedAt: new Date(session).toISOString() },
      runId: "smoke_session",
      completedMissionIds: [],
      now: session + 2000,
    });
    const completedRecords = await listPartyRecordsForPlayer(
      "room_session",
      players[0]!,
      currentPartyRecordFilters(state, { runId: "smoke_session" }),
    );
    assert.equal(
      completedRecords.filter((record) => record.kind === SMOKE_SCREEN_RESULT_KIND).length,
      1,
    );
    state.party = {
      ...state.party!,
      experienceId: "smoke-neon-norrebro",
      actId: "bar",
      venue: "bar",
    };
    state.oracleMemory = {
      runId: "oracle_session",
      participantIds: [players[0]!.id],
      submittedPlayerIds: [players[0]!.id],
      verifiedPlayerIds: [],
      status: "revealed",
    };
    rows.push({
      ...rows[0]!,
      id: "oracle_prophecy",
      run_id: "oracle_session",
      game_id: "grilloracle",
      kind: ORACLE_RECORD_KIND,
      visibility: "revealed",
      idempotency_key: "oracle_prophecy_session",
      payload: {
        version: 1,
        reading: {
          item_guess: "Toast",
          doneness_verdict: "Charred",
          prophecy: "The bread predicts a quiet evening",
          predictions: ["One toast", "Two jokes", "Three glasses"],
          char_reading_style: "Smoke",
          points: 5,
        },
        capture: { mode: "host-fallback", capturedAt: session },
      },
    });
    await verifyOraclePredictions({
      room: { id: "room_session", code: "TEST", state, updatedAt: new Date(session).toISOString() },
      runId: "oracle_session",
      playerId: players[0]!.id,
      results: [false, false, false],
      now: session + 3000,
    });
    const verdicts = await listPartyRecordsForPlayer(
      "room_session",
      players[1]!,
      currentPartyRecordFilters(state, {
        runId: "oracle_session",
        kind: ORACLE_VERDICT_RECORD_KIND,
      }),
    );
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0]?.payloadRedacted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await verifyRevealedRecordSession();
console.log("Revealed record session verified");
