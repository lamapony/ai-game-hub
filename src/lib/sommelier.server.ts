import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SOMMELIER_ANALYSIS_KIND,
  SOMMELIER_CROWD_FAVORITE_KIND,
  SOMMELIER_GUESS_KIND,
  SOMMELIER_RESULT_KIND,
  SOMMELIER_SUBMISSION_KIND,
  sommelierAnalysisRecordSchema,
  sommelierCrowdFavoriteRecordSchema,
  sommelierGuessRecordSchema,
  sommelierResultRecordSchema,
  sommelierSubmissionRecordSchema,
  type SommelierRoundResult,
} from "@/games/sommelier/model";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { sommelierVisionSpec } from "./ai/sommelier.prompts";
import {
  beginSommelierAnalysisState,
  finalizeSommelierState,
  markSommelierSubmittedState,
  markSommelierVotedState,
  openSommelierCrowdFavoriteState,
  openSommelierVotingState,
  revealSommelierEntryState,
} from "./game-state";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { normalizePartyContext } from "./party-context";
import {
  createPartyRecord,
  findPartyRecordByIdempotency,
  listPartyRecordRows,
} from "./party-records.server";
import type { PartyRecordRow } from "./party-records";
import {
  assertPlayerMayUpload,
  assertPlayerStoragePath,
  assertStorageObjectExists,
  mediaKindForAction,
  RECORDINGS_BUCKET,
} from "./player-media.server";
import { statusError } from "./player-auth.server";
import { migrateRoomState } from "./room-state-migration";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import { awardScoreEvents } from "./score-events.server";
import type { ScoreAwardInput } from "./score-events";
import {
  scoreSommelierRound,
  SOMMELIER_CROWD_FAVORITE_POINTS,
  type SommelierBallot,
} from "./sommelier-lifecycle";
import type { Player, RoomState, SommelierPublicProfile } from "./types";

type SommelierRoomSnapshot = { id: string; state: RoomState; updatedAt: string };
type Submission = ReturnType<typeof assertSubmissionRow>;
type Analysis = ReturnType<typeof assertAnalysisRow>;

export const SOMMELIER_IMAGE_MAX_BYTES = 8_000_000;

function hashedKey(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export const sommelierSubmissionIdempotencyKey = (sessionId: string, playerId: string) =>
  hashedKey("somm_submission", `${sessionId}:${playerId}`);
export const sommelierAnalysisIdempotencyKey = (sessionId: string, playerId: string) =>
  hashedKey("somm_analysis", `${sessionId}:${playerId}`);
export const sommelierGuessIdempotencyKey = (
  sessionId: string,
  entryId: string,
  playerId: string,
) => hashedKey("somm_guess", `${sessionId}:${entryId}:${playerId}`);
export const sommelierResultIdempotencyKey = (sessionId: string, entryId: string) =>
  hashedKey("somm_result", `${sessionId}:${entryId}`);
export const sommelierCrowdFavoriteIdempotencyKey = (sessionId: string) =>
  hashedKey("somm_crowd", sessionId);
export const sommelierScoreIdempotencyKey = (
  sessionId: string,
  entryId: string,
  playerId: string,
  reason: "guess" | "hidden" | "crowd",
) => hashedKey("somm_score", `${sessionId}:${entryId}:${playerId}:${reason}`);

function stableSeed(identity: string) {
  return Number.parseInt(createHash("sha256").update(identity).digest("hex").slice(0, 8), 16);
}

function assertSommelierSession(state: RoomState, sessionId: string) {
  const sommelier = state.sommelier;
  if (state.currentGame !== "sommelier" || !sommelier || sommelier.sessionId !== sessionId) {
    throw statusError("Sommelier session is no longer active", 409);
  }
  return sommelier;
}

async function loadSommelierRoom(roomId: string): Promise<SommelierRoomSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, state, updated_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  return {
    id: data.id,
    state: migrateRoomState(data.state as unknown as RoomState),
    updatedAt: data.updated_at,
  };
}

async function writeSommelierRoom(snapshot: SommelierRoomSnapshot, state: RoomState) {
  if (snapshot.state === state) return true;
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .update({ state: state as never })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updatedAt)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function updateSommelierState(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSommelierRoom(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Sommelier state changed", 409);
      return { state, value: state.sommelier };
    },
    writeSnapshot: writeSommelierRoom,
  });
}

function assertSubmissionRow(row: PartyRecordRow, sessionId: string, playerId?: string) {
  if (
    row.run_id !== sessionId ||
    row.game_id !== "sommelier" ||
    row.kind !== SOMMELIER_SUBMISSION_KIND ||
    !row.owner_player_id ||
    (playerId && row.owner_player_id !== playerId)
  ) {
    throw statusError("invalid Sommelier submission", 409);
  }
  const payload = sommelierSubmissionRecordSchema.parse(row.payload);
  if (payload.ownerPlayerId !== row.owner_player_id) {
    throw statusError("Sommelier submission owner changed", 409);
  }
  return payload;
}

function assertAnalysisRow(row: PartyRecordRow, sessionId: string, playerId?: string) {
  if (
    row.run_id !== sessionId ||
    row.game_id !== "sommelier" ||
    row.kind !== SOMMELIER_ANALYSIS_KIND ||
    !row.owner_player_id ||
    (playerId && row.owner_player_id !== playerId)
  ) {
    throw statusError("invalid Sommelier analysis", 409);
  }
  const payload = sommelierAnalysisRecordSchema.parse(row.payload);
  if (payload.ownerPlayerId !== row.owner_player_id) {
    throw statusError("Sommelier analysis owner changed", 409);
  }
  return payload;
}

function assertGuessRow(row: PartyRecordRow, sessionId: string, playerId?: string) {
  if (
    row.run_id !== sessionId ||
    row.game_id !== "sommelier" ||
    row.kind !== SOMMELIER_GUESS_KIND ||
    !row.owner_player_id ||
    (playerId && row.owner_player_id !== playerId)
  ) {
    throw statusError("invalid Sommelier ballot", 409);
  }
  return sommelierGuessRecordSchema.parse(row.payload);
}

async function sessionRows(roomId: string, sessionId: string, kind: string) {
  const rows = await listPartyRecordRows(roomId, { runId: sessionId, kind });
  return rows.filter((row) => row.game_id === "sommelier" && row.run_id === sessionId);
}

async function sessionSubmissions(roomId: string, sessionId: string) {
  const rows = await sessionRows(roomId, sessionId, SOMMELIER_SUBMISSION_KIND);
  const byOwner = new Map<string, Submission>();
  rows.forEach((row) => {
    const record = assertSubmissionRow(row, sessionId);
    if (!byOwner.has(record.ownerPlayerId)) byOwner.set(record.ownerPlayerId, record);
  });
  return [...byOwner.values()];
}

async function sessionAnalyses(roomId: string, sessionId: string) {
  const rows = await sessionRows(roomId, sessionId, SOMMELIER_ANALYSIS_KIND);
  const byEntry = new Map<string, Analysis>();
  rows.forEach((row) => {
    const record = assertAnalysisRow(row, sessionId);
    if (!byEntry.has(record.entryId)) byEntry.set(record.entryId, record);
  });
  return [...byEntry.values()].sort((a, b) => a.entryId.localeCompare(b.entryId));
}

async function analysisForEntry(roomId: string, sessionId: string, entryId: string) {
  const analyses = await sessionAnalyses(roomId, sessionId);
  const analysis = analyses.find((candidate) => candidate.entryId === entryId);
  if (!analysis) throw statusError("Sommelier card not found", 404);
  return analysis;
}

async function signedSommelierImageUrl(storagePath: string) {
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);
  const signed = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, 600);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

function publicProfile(analysis: Analysis): SommelierPublicProfile {
  return analysis.profile;
}

export async function submitSommelierPhoto(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  sessionId: string;
  storagePath: unknown;
  now?: number;
}) {
  const sommelier = assertSommelierSession(params.state, params.sessionId);
  if (!sommelier.participantIds.includes(params.player.id)) {
    throw statusError("player is not a drink owner in this session", 403);
  }
  const key = sommelierSubmissionIdempotencyKey(params.sessionId, params.player.id);
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  let replayed = false;
  if (existing) {
    const record = assertSubmissionRow(existing, params.sessionId, params.player.id);
    if (
      typeof params.storagePath === "string" &&
      record.storagePath !== params.storagePath.trim()
    ) {
      throw statusError("Sommelier photo is already sealed", 409);
    }
    replayed = true;
  } else {
    assertPlayerMayUpload(
      params.state,
      "sommelier-photo",
      params.player,
      params.sessionId,
      params.now,
    );
    const storagePath = assertPlayerStoragePath({
      storagePath: params.storagePath,
      roomId: params.roomId,
      kind: mediaKindForAction("sommelier-photo"),
      roundId: params.sessionId,
      playerId: params.player.id,
    });
    const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
    assertStorageObjectExists(exists);
    const downloaded = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(storagePath);
    if (downloaded.error) throw downloaded.error;
    if (downloaded.data.size > SOMMELIER_IMAGE_MAX_BYTES) {
      throw statusError("Sommelier photo is too large", 413);
    }
    await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey: key,
        runId: params.sessionId,
        gameId: "sommelier",
        ownerPlayerId: params.player.id,
        kind: SOMMELIER_SUBMISSION_KIND,
        visibility: "host",
        payload: {
          version: 1,
          entryId: `drink_${randomUUID()}`,
          ownerPlayerId: params.player.id,
          storagePath,
          submittedAt: params.now ?? Date.now(),
        },
      },
    });
  }

  if (sommelier.submittedPlayerIds.includes(params.player.id) || sommelier.phase !== "capture") {
    return { sommelier, replayed: true };
  }
  const updated = await updateSommelierState(params.roomId, (state) =>
    markSommelierSubmittedState(state, params.sessionId, params.player.id),
  );
  return { sommelier: updated.state.sommelier!, replayed };
}

export async function prepareSommelierSession(params: {
  room: AuthorizedHostRoom;
  sessionId: string;
  now?: number;
}) {
  const initial = assertSommelierSession(params.room.state, params.sessionId);
  if (params.room.state.party?.actId !== "bar") {
    throw statusError("Sommelier Charlatan needs the bar act", 409);
  }
  if (["voting", "reveal", "crowd-favorite", "results"].includes(initial.phase)) {
    return { sommelier: initial };
  }
  if (!["capture", "analyzing"].includes(initial.phase)) {
    throw statusError("Sommelier analysis is closed", 409);
  }

  let workingState = params.room.state;
  if (initial.phase === "capture") {
    const transition = await updateSommelierState(params.room.id, (state) =>
      beginSommelierAnalysisState(state, params.sessionId),
    );
    workingState = transition.state;
  }
  const submissions = await sessionSubmissions(params.room.id, params.sessionId);
  if (submissions.length < 2) throw statusError("at least two drink photos are required", 409);
  const context = normalizePartyContext(workingState.party, workingState.venue);

  const analyses = await Promise.all(
    submissions.map(async (submission) => {
      const key = sommelierAnalysisIdempotencyKey(params.sessionId, submission.ownerPlayerId);
      const existing = await findPartyRecordByIdempotency(params.room.id, key);
      if (existing) return assertAnalysisRow(existing, params.sessionId, submission.ownerPlayerId);

      const imageUrl = await signedSommelierImageUrl(submission.storagePath);
      const generated = await runPromptSpec({
        spec: sommelierVisionSpec,
        input: {
          imageUrl,
          seed: stableSeed(`${params.sessionId}:${submission.entryId}`),
        },
        context,
        temperature: 0.8,
        budget: {
          roomId: params.room.id,
          operationId: `sommelier:${params.sessionId}:${submission.ownerPlayerId}:analysis`,
        },
      });
      const created = await createPartyRecord({
        roomId: params.room.id,
        state: workingState,
        input: {
          idempotencyKey: key,
          runId: params.sessionId,
          gameId: "sommelier",
          ownerPlayerId: submission.ownerPlayerId,
          kind: SOMMELIER_ANALYSIS_KIND,
          visibility: "host",
          payload: {
            version: 1,
            entryId: submission.entryId,
            ownerPlayerId: submission.ownerPlayerId,
            profile: generated.output,
            aiFallback: generated.usedFallback,
            completedAt: params.now ?? Date.now(),
          },
        },
      });
      return assertAnalysisRow(created.row, params.sessionId, submission.ownerPlayerId);
    }),
  );
  analyses.sort((a, b) => a.entryId.localeCompare(b.entryId));
  const first = analyses[0]!;
  const updated = await updateSommelierState(params.room.id, (state) => {
    const current = state.sommelier;
    if (
      current?.sessionId === params.sessionId &&
      ["voting", "reveal", "crowd-favorite", "results"].includes(current.phase)
    ) {
      return state;
    }
    return openSommelierVotingState(state, {
      sessionId: params.sessionId,
      entryId: first.entryId,
      profile: publicProfile(first),
      aiFallback: first.aiFallback,
      roundNumber: 1,
      totalRounds: analyses.length,
      now: params.now,
    });
  });
  return { sommelier: updated.state.sommelier! };
}

export async function currentSommelierCard(params: {
  room: AuthorizedHostRoom;
  sessionId: string;
}) {
  const sommelier = assertSommelierSession(params.room.state, params.sessionId);
  if (!sommelier.currentEntryId || !["voting", "reveal"].includes(sommelier.phase)) {
    return { sommelier, card: null };
  }
  const analysis = await analysisForEntry(
    params.room.id,
    params.sessionId,
    sommelier.currentEntryId,
  );
  const submissions = await sessionSubmissions(params.room.id, params.sessionId);
  const submission = submissions.find((candidate) => candidate.entryId === analysis.entryId);
  if (!submission) throw statusError("Sommelier photo not found", 404);
  const revealed = sommelier.result?.entryId === analysis.entryId ? sommelier.result : undefined;
  return {
    sommelier,
    card: {
      entryId: analysis.entryId,
      imageUrl: await signedSommelierImageUrl(submission.storagePath),
      ...(revealed
        ? {
            ownerPlayerId: revealed.ownerPlayerId,
            ownerPlayerName: revealed.ownerPlayerName,
          }
        : {}),
    },
  };
}

export async function sommelierPlayerStatus(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  sessionId: string;
}) {
  const sommelier = assertSommelierSession(params.state, params.sessionId);
  if (!sommelier.currentEntryId || !["voting", "reveal"].includes(sommelier.phase)) {
    return { isOwner: false, hasSubmittedBallot: false };
  }
  const analysis = await analysisForEntry(
    params.roomId,
    params.sessionId,
    sommelier.currentEntryId,
  );
  const key = sommelierGuessIdempotencyKey(
    params.sessionId,
    sommelier.currentEntryId,
    params.player.id,
  );
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  if (existing) assertGuessRow(existing, params.sessionId, params.player.id);
  return {
    isOwner: analysis.ownerPlayerId === params.player.id,
    hasSubmittedBallot: Boolean(existing),
  };
}

export async function submitSommelierGuess(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  sessionId: string;
  entryId: string;
  guessedOwnerPlayerId: string;
  now?: number;
}) {
  const sommelier = assertSommelierSession(params.state, params.sessionId);
  if (sommelier.phase !== "voting" || sommelier.currentEntryId !== params.entryId) {
    throw statusError("Sommelier voting is closed", 409);
  }
  const analysis = await analysisForEntry(params.roomId, params.sessionId, params.entryId);
  if (analysis.ownerPlayerId === params.player.id) {
    throw statusError("the drink owner keeps a straight face instead of voting", 403);
  }
  if (!sommelier.submittedPlayerIds.includes(params.guessedOwnerPlayerId)) {
    throw statusError("unknown drink owner candidate", 400);
  }
  if (params.guessedOwnerPlayerId === params.player.id) {
    throw statusError("choose another drink owner", 400);
  }
  const key = sommelierGuessIdempotencyKey(params.sessionId, params.entryId, params.player.id);
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  if (existing) {
    const ballot = assertGuessRow(existing, params.sessionId, params.player.id);
    if (
      ballot.entryId !== params.entryId ||
      ballot.guessedOwnerPlayerId !== params.guessedOwnerPlayerId
    ) {
      throw statusError("Sommelier ballot is already sealed", 409);
    }
  } else {
    if (!sommelier.votingEndsAt || (params.now ?? Date.now()) > sommelier.votingEndsAt) {
      throw statusError("Sommelier voting time is over", 409);
    }
    await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey: key,
        runId: params.sessionId,
        gameId: "sommelier",
        ownerPlayerId: params.player.id,
        kind: SOMMELIER_GUESS_KIND,
        visibility: "player",
        payload: {
          version: 1,
          entryId: params.entryId,
          guessedOwnerPlayerId: params.guessedOwnerPlayerId,
          submittedAt: params.now ?? Date.now(),
        },
      },
    });
  }
  if (sommelier.submittedVoterIds.includes(params.player.id)) return { sommelier };
  const updated = await updateSommelierState(params.roomId, (state) =>
    markSommelierVotedState(state, {
      sessionId: params.sessionId,
      entryId: params.entryId,
      playerId: params.player.id,
    }),
  );
  return { sommelier: updated.state.sommelier! };
}

async function ballotsForEntry(roomId: string, sessionId: string, entryId: string) {
  const rows = await sessionRows(roomId, sessionId, SOMMELIER_GUESS_KIND);
  return rows.flatMap((row): SommelierBallot[] => {
    if (!row.owner_player_id) return [];
    const ballot = assertGuessRow(row, sessionId);
    return ballot.entryId === entryId
      ? [
          {
            voterPlayerId: row.owner_player_id,
            guessedOwnerPlayerId: ballot.guessedOwnerPlayerId,
          },
        ]
      : [];
  });
}

function sommelierRoundScoreEvents(
  sessionId: string,
  result: SommelierRoundResult,
  state: RoomState,
): ScoreAwardInput[] {
  const ownerEvent: ScoreAwardInput[] =
    result.ownerPoints > 0
      ? [
          {
            idempotencyKey: sommelierScoreIdempotencyKey(
              sessionId,
              result.entryId,
              result.ownerPlayerId,
              "hidden",
            ),
            runId: sessionId,
            gameId: "sommelier",
            teamId: result.ownerTeamId,
            playerId: result.ownerPlayerId,
            points: result.ownerPoints,
            reason: "Sommelier owner stayed anonymous",
            source: "deterministic",
            rubric: { correctGuesserCount: result.correctGuesserIds.length },
          },
        ]
      : [];
  const guesserEvents = Object.entries(result.guesserPoints).flatMap(
    ([playerId, points]): ScoreAwardInput[] => {
      const player = state.players.find((candidate) => candidate.id === playerId);
      return !player || points <= 0
        ? []
        : [
            {
              idempotencyKey: sommelierScoreIdempotencyKey(
                sessionId,
                result.entryId,
                playerId,
                "guess",
              ),
              runId: sessionId,
              gameId: "sommelier",
              teamId: player.teamId,
              playerId,
              points,
              reason: "Correctly identified the anonymous drink owner",
              source: "vote",
              rubric: { entryId: result.entryId },
            },
          ];
    },
  );
  return [...ownerEvent, ...guesserEvents];
}

export async function revealSommelierCard(params: {
  room: AuthorizedHostRoom;
  sessionId: string;
  entryId: string;
  allowNoVotes?: boolean;
  now?: number;
}) {
  const sommelier = assertSommelierSession(params.room.state, params.sessionId);
  if (sommelier.phase === "reveal" && sommelier.result?.entryId === params.entryId) {
    return { sommelier, result: sommelier.result };
  }
  if (sommelier.phase !== "voting" || sommelier.currentEntryId !== params.entryId) {
    throw statusError("Sommelier reveal is not ready", 409);
  }
  const key = sommelierResultIdempotencyKey(params.sessionId, params.entryId);
  const existing = await findPartyRecordByIdempotency(params.room.id, key);
  let resultRecord;
  if (existing) {
    resultRecord = sommelierResultRecordSchema.parse(existing.payload);
  } else {
    const [analysis, ballots] = await Promise.all([
      analysisForEntry(params.room.id, params.sessionId, params.entryId),
      ballotsForEntry(params.room.id, params.sessionId, params.entryId),
    ]);
    if (ballots.length === 0 && !params.allowNoVotes) {
      throw statusError("at least one human guess is required", 409);
    }
    if (
      ballots.length === 0 &&
      params.allowNoVotes &&
      (!sommelier.votingEndsAt || (params.now ?? Date.now()) < sommelier.votingEndsAt)
    ) {
      throw statusError("Sommelier voting timer is still running", 409);
    }
    const owner = params.room.state.players.find((player) => player.id === analysis.ownerPlayerId);
    if (!owner) throw statusError("Sommelier owner left the room", 409);
    const result = scoreSommelierRound({
      entryId: analysis.entryId,
      ownerPlayerId: owner.id,
      ownerPlayerName: owner.name,
      ownerTeamId: owner.teamId,
      profile: analysis.profile,
      aiFallback: analysis.aiFallback,
      candidatePlayerIds: sommelier.submittedPlayerIds,
      ballots,
    });
    const created = await createPartyRecord({
      roomId: params.room.id,
      state: params.room.state,
      input: {
        idempotencyKey: key,
        runId: params.sessionId,
        gameId: "sommelier",
        ownerPlayerId: owner.id,
        kind: SOMMELIER_RESULT_KIND,
        visibility: "host",
        payload: { version: 1, result, completedAt: params.now ?? Date.now() },
      },
    });
    resultRecord = sommelierResultRecordSchema.parse(created.row.payload);
  }

  const events = sommelierRoundScoreEvents(
    params.sessionId,
    resultRecord.result,
    params.room.state,
  );
  if (events.length > 0) {
    await awardScoreEvents({ roomId: params.room.id, state: params.room.state, events });
  }
  const updated = await updateSommelierState(params.room.id, (state) =>
    revealSommelierEntryState(state, params.sessionId, resultRecord.result),
  );
  return { sommelier: updated.state.sommelier!, result: resultRecord.result };
}

export async function nextSommelierCard(params: {
  room: AuthorizedHostRoom;
  sessionId: string;
  entryId: string;
  now?: number;
}) {
  const sommelier = assertSommelierSession(params.room.state, params.sessionId);
  const latestResult = sommelier.roundResults[sommelier.roundResults.length - 1];
  if (
    ["crowd-favorite", "results"].includes(sommelier.phase) &&
    latestResult?.entryId === params.entryId
  ) {
    return { sommelier };
  }
  if (
    sommelier.phase === "voting" &&
    sommelier.currentEntryId !== params.entryId &&
    sommelier.roundResults.some((result) => result.entryId === params.entryId)
  ) {
    return { sommelier };
  }
  if (sommelier.phase !== "reveal" || sommelier.currentEntryId !== params.entryId) {
    throw statusError("Sommelier card cannot advance", 409);
  }
  const analyses = await sessionAnalyses(params.room.id, params.sessionId);
  const nextIndex = sommelier.roundResults.length;
  if (nextIndex >= analyses.length) {
    const updated = await updateSommelierState(params.room.id, (state) =>
      openSommelierCrowdFavoriteState(state, params.sessionId, params.entryId),
    );
    return { sommelier: updated.state.sommelier! };
  }
  const next = analyses[nextIndex]!;
  const updated = await updateSommelierState(params.room.id, (state) =>
    openSommelierVotingState(state, {
      sessionId: params.sessionId,
      entryId: next.entryId,
      profile: publicProfile(next),
      aiFallback: next.aiFallback,
      roundNumber: nextIndex + 1,
      totalRounds: analyses.length,
      now: params.now,
    }),
  );
  return { sommelier: updated.state.sommelier! };
}

export async function chooseSommelierCrowdFavorite(params: {
  room: AuthorizedHostRoom;
  sessionId: string;
  entryId: string;
  now?: number;
}) {
  const sommelier = assertSommelierSession(params.room.state, params.sessionId);
  if (
    sommelier.phase === "results" &&
    sommelier.crowdFavoriteEntryId === params.entryId &&
    sommelier.crowdFavoriteOwnerId
  ) {
    return { sommelier };
  }
  if (sommelier.phase !== "crowd-favorite") {
    throw statusError("crowd favorite is not ready", 409);
  }
  const selected = sommelier.roundResults.find((result) => result.entryId === params.entryId);
  if (!selected) throw statusError("unknown Sommelier crowd favorite", 400);
  const key = sommelierCrowdFavoriteIdempotencyKey(params.sessionId);
  const existing = await findPartyRecordByIdempotency(params.room.id, key);
  let record;
  if (existing) {
    record = sommelierCrowdFavoriteRecordSchema.parse(existing.payload);
    if (record.entryId !== params.entryId) {
      throw statusError("crowd favorite is already sealed", 409);
    }
  } else {
    const created = await createPartyRecord({
      roomId: params.room.id,
      state: params.room.state,
      input: {
        idempotencyKey: key,
        runId: params.sessionId,
        gameId: "sommelier",
        ownerPlayerId: selected.ownerPlayerId,
        kind: SOMMELIER_CROWD_FAVORITE_KIND,
        visibility: "host",
        payload: {
          version: 1,
          entryId: selected.entryId,
          ownerPlayerId: selected.ownerPlayerId,
          bonusPoints: SOMMELIER_CROWD_FAVORITE_POINTS,
          selectedAt: params.now ?? Date.now(),
        },
      },
    });
    record = sommelierCrowdFavoriteRecordSchema.parse(created.row.payload);
  }

  await awardScoreEvents({
    roomId: params.room.id,
    state: params.room.state,
    events: [
      {
        idempotencyKey: sommelierScoreIdempotencyKey(
          params.sessionId,
          record.entryId,
          record.ownerPlayerId,
          "crowd",
        ),
        runId: params.sessionId,
        gameId: "sommelier",
        teamId: selected.ownerTeamId,
        playerId: record.ownerPlayerId,
        points: record.bonusPoints,
        reason: "Loudest room reaction of the Sommelier session",
        source: "host-adjustment",
        rubric: { selectedByHost: true, entryId: record.entryId },
      },
    ],
  });
  const updated = await updateSommelierState(params.room.id, (state) =>
    finalizeSommelierState(state, {
      sessionId: params.sessionId,
      entryId: record.entryId,
      ownerPlayerId: record.ownerPlayerId,
    }),
  );
  return { sommelier: updated.state.sommelier! };
}
