import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STILL_LIFE_HEADLINE_KIND,
  STILL_LIFE_JUDGMENT_KIND,
  STILL_LIFE_RESULT_KIND,
  STILL_LIFE_SUBMISSION_KIND,
  STILL_LIFE_VOTE_KIND,
  stillLifeHeadlineRecordSchema,
  stillLifeJudgmentRecordSchema,
  stillLifeResultRecordSchema,
  stillLifeSubmissionRecordSchema,
  stillLifeVoteRecordSchema,
  type StillLifeJudgment,
} from "@/games/stilllife/model";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { preparedAiOutput } from "./ai-prewarm.server";
import {
  stillLifeHeadlineSpec,
  stillLifeJudgmentSpec,
  type StillLifeHeadlineOutput,
} from "./ai/stilllife.prompts";
import {
  beginStillLifeJudgingState,
  finalizeStillLifeState,
  markStillLifeTeamSubmittedState,
  markStillLifeVotedState,
  nextStillLifeRoundState,
  openStillLifeVotingState,
  prepareStillLifeRoundState,
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
  scoreStillLifeRound,
  stillLifeJudgmentPoints,
  type StillLifeManualScore,
  type StillLifeScoredJudgment,
} from "./stilllife-lifecycle";
import type { Player, RoomState, StillLifeResultEntry } from "./types";

type StillLifeRoomSnapshot = { id: string; state: RoomState; updatedAt: string };

export const STILL_LIFE_IMAGE_MAX_BYTES = 8_000_000;

function hashedKey(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export const stillLifeHeadlineIdempotencyKey = (roundId: string) =>
  hashedKey("still_headline", roundId);
export const stillLifeSubmissionIdempotencyKey = (roundId: string, teamId: string) =>
  hashedKey("still_submission", `${roundId}:${teamId}`);
export const stillLifeJudgmentIdempotencyKey = (roundId: string, teamId: string) =>
  hashedKey("still_judgment", `${roundId}:${teamId}`);
export const stillLifeVoteIdempotencyKey = (roundId: string, playerId: string) =>
  hashedKey("still_vote", `${roundId}:${playerId}`);
export const stillLifeResultIdempotencyKey = (roundId: string) =>
  hashedKey("still_result", roundId);
export const stillLifeScoreIdempotencyKey = (roundId: string, teamId: string) =>
  hashedKey("still_score", `${roundId}:${teamId}`);

function stableSeed(identity: string) {
  return Number.parseInt(createHash("sha256").update(identity).digest("hex").slice(0, 8), 16);
}

function assertStillLifeRound(state: RoomState, roundId: string) {
  const still = state.stilllife;
  if (state.currentGame !== "stilllife" || !still || still.roundId !== roundId) {
    throw statusError("Still Life round is no longer active", 409);
  }
  return still;
}

async function loadStillLifeRoom(roomId: string): Promise<StillLifeRoomSnapshot> {
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

async function writeStillLifeRoom(snapshot: StillLifeRoomSnapshot, state: RoomState) {
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

async function updateStillLifeState(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadStillLifeRoom(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Still Life state changed", 409);
      return { state, value: state.stilllife };
    },
    writeSnapshot: writeStillLifeRoom,
  });
}

function assertHeadlineRow(row: PartyRecordRow, roundId: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "stilllife" ||
    row.kind !== STILL_LIFE_HEADLINE_KIND
  ) {
    throw statusError("invalid Still Life headline", 409);
  }
  return stillLifeHeadlineRecordSchema.parse(row.payload);
}

function assertSubmissionRow(row: PartyRecordRow, roundId: string, teamId?: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "stilllife" ||
    row.kind !== STILL_LIFE_SUBMISSION_KIND ||
    (teamId && row.owner_team_id !== teamId)
  ) {
    throw statusError("invalid Still Life submission", 409);
  }
  const payload = stillLifeSubmissionRecordSchema.parse(row.payload);
  if (payload.teamId !== row.owner_team_id) throw statusError("submission team changed", 409);
  return payload;
}

function assertJudgmentRow(row: PartyRecordRow, roundId: string, teamId?: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "stilllife" ||
    row.kind !== STILL_LIFE_JUDGMENT_KIND ||
    (teamId && row.owner_team_id !== teamId)
  ) {
    throw statusError("invalid Still Life judgment", 409);
  }
  const payload = stillLifeJudgmentRecordSchema.parse(row.payload);
  if (payload.teamId !== row.owner_team_id) throw statusError("judgment team changed", 409);
  return payload;
}

function assertVoteRow(row: PartyRecordRow, roundId: string, playerId?: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "stilllife" ||
    row.kind !== STILL_LIFE_VOTE_KIND ||
    (playerId && row.owner_player_id !== playerId)
  ) {
    throw statusError("invalid Still Life vote", 409);
  }
  return stillLifeVoteRecordSchema.parse(row.payload);
}

async function recentStillLifeHeadlines(roomId: string, sessionId: string) {
  const rows = await listPartyRecordRows(roomId, { kind: STILL_LIFE_HEADLINE_KIND });
  return rows.flatMap((row) => {
    if (!row.run_id.startsWith(`${sessionId}_r`) || row.game_id !== "stilllife") return [];
    const parsed = stillLifeHeadlineRecordSchema.safeParse(row.payload);
    return parsed.success ? [parsed.data.headline] : [];
  });
}

function canonicalHeadline(
  output: StillLifeHeadlineOutput,
  recentHeadlines: string[],
): string | null {
  const headline = output.headlines[0]?.trim();
  if (!headline) return null;
  const normalized = headline.toLocaleLowerCase();
  return recentHeadlines.some((recent) => recent.toLocaleLowerCase() === normalized)
    ? null
    : headline;
}

export async function prepareStillLifeRound(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  now?: number;
}) {
  const still = assertStillLifeRound(params.room.state, params.roundId);
  if (!["grill", "bar"].includes(params.room.state.party?.actId ?? "")) {
    throw statusError("Still Life needs the grill or bar act", 409);
  }
  if (still.headline && still.phase !== "briefing") return { still };
  if (still.phase !== "briefing") throw statusError("headline generation is closed", 409);

  const key = stillLifeHeadlineIdempotencyKey(params.roundId);
  const existing = await findPartyRecordByIdempotency(params.room.id, key);
  let record;
  if (existing) {
    record = assertHeadlineRow(existing, params.roundId);
  } else {
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const recentHeadlines = await recentStillLifeHeadlines(params.room.id, still.sessionId);
    const seed = stableSeed(params.roundId);
    const prepared = await preparedAiOutput({
      roomId: params.room.id,
      state: params.room.state,
      gameId: "stilllife",
      targetActId: context.actId,
    });
    const preparedOutput = stillLifeHeadlineSpec.outputSchema.safeParse(prepared?.output);
    const generated = preparedOutput.success
      ? { output: preparedOutput.data, usedFallback: prepared?.usedFallback ?? false }
      : await runPromptSpec({
          spec: stillLifeHeadlineSpec,
          input: { seed, recentHeadlines },
          context,
          temperature: 0.9,
          budget: {
            roomId: params.room.id,
            operationId: `stilllife:${params.roundId}:headline`,
          },
        });
    const generatedHeadline = canonicalHeadline(generated.output, recentHeadlines);
    const headline =
      generatedHeadline ??
      stillLifeHeadlineSpec.fallback({ seed, recentHeadlines }, context).headlines[0]!;
    const created = await createPartyRecord({
      roomId: params.room.id,
      state: params.room.state,
      input: {
        idempotencyKey: key,
        runId: params.roundId,
        gameId: "stilllife",
        kind: STILL_LIFE_HEADLINE_KIND,
        visibility: "host",
        payload: {
          version: 1,
          headline,
          generatedAt: params.now ?? Date.now(),
          aiFallback: generated.usedFallback || !generatedHeadline,
        },
      },
    });
    record = assertHeadlineRow(created.row, params.roundId);
  }

  const updated = await updateStillLifeState(params.room.id, (state) =>
    prepareStillLifeRoundState(state, {
      roundId: params.roundId,
      headline: record.headline,
      aiFallback: record.aiFallback,
      now: params.now,
    }),
  );
  return { still: updated.state.stilllife! };
}

export async function submitStillLifePhoto(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  roundId: string;
  storagePath: unknown;
  now?: number;
}) {
  const still = assertStillLifeRound(params.state, params.roundId);
  if (!still.activeTeamIds.includes(params.player.teamId)) {
    throw statusError("player team is not in this Still Life round", 403);
  }
  const key = stillLifeSubmissionIdempotencyKey(params.roundId, params.player.teamId);
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  let replayed = false;
  if (existing) {
    assertSubmissionRow(existing, params.roundId, params.player.teamId);
    replayed = true;
  } else {
    assertPlayerMayUpload(
      params.state,
      "stilllife-photo",
      params.player,
      params.roundId,
      params.now,
    );
    const storagePath = assertPlayerStoragePath({
      storagePath: params.storagePath,
      roomId: params.roomId,
      kind: mediaKindForAction("stilllife-photo"),
      roundId: params.roundId,
      playerId: params.player.id,
    });
    const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
    assertStorageObjectExists(exists);
    const downloaded = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(storagePath);
    if (downloaded.error) throw downloaded.error;
    if (downloaded.data.size > STILL_LIFE_IMAGE_MAX_BYTES) {
      throw statusError("Still Life photo is too large", 413);
    }
    await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey: key,
        runId: params.roundId,
        gameId: "stilllife",
        ownerTeamId: params.player.teamId,
        kind: STILL_LIFE_SUBMISSION_KIND,
        visibility: "host",
        payload: {
          version: 1,
          teamId: params.player.teamId,
          submittedByPlayerId: params.player.id,
          storagePath,
          submittedAt: params.now ?? Date.now(),
        },
      },
    });
  }

  if (still.submittedTeamIds.includes(params.player.teamId) || still.phase !== "building") {
    return { still, replayed: true };
  }
  const updated = await updateStillLifeState(params.roomId, (state) =>
    markStillLifeTeamSubmittedState(state, params.roundId, params.player.teamId),
  );
  return { still: updated.state.stilllife!, replayed };
}

async function signedStillLifeImageUrl(storagePath: string) {
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);
  const signed = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, 600);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

async function roundSubmissions(roomId: string, roundId: string) {
  const rows = await listPartyRecordRows(roomId, { kind: STILL_LIFE_SUBMISSION_KIND });
  const byTeam = new Map<string, ReturnType<typeof assertSubmissionRow>>();
  rows.forEach((row) => {
    if (row.run_id !== roundId || row.game_id !== "stilllife") return;
    const parsed = assertSubmissionRow(row, roundId);
    if (!byTeam.has(parsed.teamId)) byTeam.set(parsed.teamId, parsed);
  });
  return [...byTeam.values()];
}

export async function listStillLifeGallery(params: { room: AuthorizedHostRoom; roundId: string }) {
  const still = assertStillLifeRound(params.room.state, params.roundId);
  const submissions = await roundSubmissions(params.room.id, params.roundId);
  const photos = await Promise.all(
    submissions.map(async (submission) => ({
      teamId: submission.teamId,
      teamName:
        params.room.state.teams.find((team) => team.id === submission.teamId)?.name ??
        submission.teamId,
      imageUrl: await signedStillLifeImageUrl(submission.storagePath),
    })),
  );
  return { still, photos };
}

function manualJudgment(
  score: StillLifeManualScore,
  headline: string,
  locale: "en" | "ru",
): StillLifeJudgment {
  const points = score.compositionScore + score.dramaScore + score.materialScore;
  return {
    composition_score: score.compositionScore,
    drama_score: score.dramaScore,
    material_score: score.materialScore,
    catalog_title:
      locale === "ru" ? `«${headline}»: протокол живого жюри` : `${headline}: Live Jury Record`,
    auction_price_dkk: 100_000 + points * 43_210,
    critique:
      locale === "ru"
        ? "Живое жюри сняло с AI монокль и взяло ответственность на себя. Цифры заверены людьми, которые видели лот, среду и степень творческого ущерба лично."
        : "The live jury removed the AI's monocle and took responsibility. The numbers were certified by people who saw the lot, the environment and the creative damage in person.",
    points,
  };
}

function validateManualScores(
  manualScores: StillLifeManualScore[] | undefined,
  submissions: Awaited<ReturnType<typeof roundSubmissions>>,
) {
  if (!manualScores) return null;
  const expected = new Set(submissions.map((submission) => submission.teamId));
  const received = new Set(manualScores.map((score) => score.teamId));
  if (
    received.size !== manualScores.length ||
    received.size !== expected.size ||
    [...expected].some((teamId) => !received.has(teamId))
  ) {
    throw statusError("manual jury must score every submitted team exactly once", 400);
  }
  return new Map(manualScores.map((score) => [score.teamId, score]));
}

export async function judgeStillLifeRound(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  manualScores?: StillLifeManualScore[];
  now?: number;
}) {
  const initial = assertStillLifeRound(params.room.state, params.roundId);
  if (["voting", "results"].includes(initial.phase)) return { still: initial };
  if (!initial.headline) throw statusError("Still Life headline is missing", 409);
  if (!["building", "judging"].includes(initial.phase)) {
    throw statusError("Still Life judging is closed", 409);
  }

  let workingState = params.room.state;
  if (initial.phase === "building") {
    const judging = await updateStillLifeState(params.room.id, (state) =>
      beginStillLifeJudgingState(state, params.roundId),
    );
    workingState = judging.state;
  }
  const still = assertStillLifeRound(workingState, params.roundId);
  const submissions = await roundSubmissions(params.room.id, params.roundId);
  if (submissions.length < 2) throw statusError("at least two team photos are required", 409);
  const manualByTeam = validateManualScores(params.manualScores, submissions);
  const context = normalizePartyContext(workingState.party, workingState.venue);

  const judgmentRecords = await Promise.all(
    submissions.map(async (submission) => {
      const key = stillLifeJudgmentIdempotencyKey(params.roundId, submission.teamId);
      const existing = await findPartyRecordByIdempotency(params.room.id, key);
      if (existing) return assertJudgmentRow(existing, params.roundId, submission.teamId);

      const teamName =
        workingState.teams.find((team) => team.id === submission.teamId)?.name ?? submission.teamId;
      const manual = manualByTeam?.get(submission.teamId);
      let judgment: StillLifeJudgment;
      let aiFallback = false;
      let manualOverride = false;
      if (manual) {
        judgment = manualJudgment(manual, still.headline!, context.contentLocale);
        manualOverride = true;
      } else {
        const imageUrl = await signedStillLifeImageUrl(submission.storagePath);
        const generated = await runPromptSpec({
          spec: stillLifeJudgmentSpec,
          input: {
            teamName,
            headline: still.headline!,
            imageUrl,
            seed: stableSeed(`${params.roundId}:${submission.teamId}`),
          },
          context,
          temperature: 0.75,
          budget: {
            roomId: params.room.id,
            operationId: `stilllife:${params.roundId}:${submission.teamId}:judgment`,
          },
        });
        judgment = {
          ...generated.output,
          points: stillLifeJudgmentPoints(generated.output),
        };
        aiFallback = generated.usedFallback;
      }

      const created = await createPartyRecord({
        roomId: params.room.id,
        state: workingState,
        input: {
          idempotencyKey: key,
          runId: params.roundId,
          gameId: "stilllife",
          ownerTeamId: submission.teamId,
          kind: STILL_LIFE_JUDGMENT_KIND,
          visibility: "host",
          payload: {
            version: 1,
            teamId: submission.teamId,
            judgment,
            aiFallback,
            manualOverride,
            completedAt: params.now ?? Date.now(),
          },
        },
      });
      return assertJudgmentRow(created.row, params.roundId, submission.teamId);
    }),
  );

  const publicJudgments: StillLifeResultEntry[] = judgmentRecords.map((record) => ({
    teamId: record.teamId,
    teamName: workingState.teams.find((team) => team.id === record.teamId)?.name ?? record.teamId,
    compositionScore: record.judgment.composition_score,
    dramaScore: record.judgment.drama_score,
    materialScore: record.judgment.material_score,
    points: stillLifeJudgmentPoints(record.judgment),
    catalogTitle: record.judgment.catalog_title,
    auctionPriceDkk: record.judgment.auction_price_dkk,
    critique: record.judgment.critique,
    audienceVotes: 0,
    aiFallback: record.aiFallback,
    manualOverride: record.manualOverride,
  }));
  const updated = await updateStillLifeState(params.room.id, (state) => {
    const current = state.stilllife;
    if (current?.roundId === params.roundId && ["voting", "results"].includes(current.phase)) {
      return state;
    }
    return openStillLifeVotingState(state, {
      roundId: params.roundId,
      judgments: publicJudgments,
      now: params.now,
    });
  });
  return { still: updated.state.stilllife! };
}

export async function submitStillLifeVote(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  roundId: string;
  teamId: string;
  now?: number;
}) {
  const still = assertStillLifeRound(params.state, params.roundId);
  if (still.phase !== "voting" || !still.judgments) {
    throw statusError("Still Life voting is closed", 409);
  }
  if (params.player.teamId === params.teamId) {
    throw statusError("vote for another team's installation", 400);
  }
  if (!still.judgments.some((entry) => entry.teamId === params.teamId)) {
    throw statusError("unknown Still Life team", 400);
  }
  const key = stillLifeVoteIdempotencyKey(params.roundId, params.player.id);
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  if (existing) {
    const record = assertVoteRow(existing, params.roundId, params.player.id);
    if (record.teamId !== params.teamId)
      throw statusError("Still Life ballot is already sealed", 409);
  } else {
    await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey: key,
        runId: params.roundId,
        gameId: "stilllife",
        ownerPlayerId: params.player.id,
        kind: STILL_LIFE_VOTE_KIND,
        visibility: "player",
        payload: {
          version: 1,
          teamId: params.teamId,
          voterTeamId: params.player.teamId,
          submittedAt: params.now ?? Date.now(),
        },
      },
    });
  }
  if (still.submittedVoterIds.includes(params.player.id)) return { still };
  const updated = await updateStillLifeState(params.roomId, (state) =>
    markStillLifeVotedState(state, params.roundId, params.player.id),
  );
  return { still: updated.state.stilllife! };
}

async function roundJudgments(roomId: string, roundId: string, state: RoomState) {
  const rows = await listPartyRecordRows(roomId, { kind: STILL_LIFE_JUDGMENT_KIND });
  return rows.flatMap((row): StillLifeScoredJudgment[] => {
    if (row.run_id !== roundId || row.game_id !== "stilllife") return [];
    const record = assertJudgmentRow(row, roundId);
    return [
      {
        teamId: record.teamId,
        teamName: state.teams.find((team) => team.id === record.teamId)?.name ?? record.teamId,
        judgment: record.judgment,
        aiFallback: record.aiFallback,
        manualOverride: record.manualOverride,
      },
    ];
  });
}

async function roundVotes(roomId: string, roundId: string) {
  const rows = await listPartyRecordRows(roomId, { kind: STILL_LIFE_VOTE_KIND });
  return rows.flatMap((row) => {
    if (row.run_id !== roundId || row.game_id !== "stilllife" || !row.owner_player_id) return [];
    const record = assertVoteRow(row, roundId);
    return [{ playerId: row.owner_player_id, teamId: record.teamId }];
  });
}

function stillLifeScoreEvents(result: ReturnType<typeof scoreStillLifeRound>): ScoreAwardInput[] {
  return result.entries.flatMap((entry) =>
    entry.points <= 0
      ? []
      : [
          {
            idempotencyKey: stillLifeScoreIdempotencyKey(result.roundId, entry.teamId),
            runId: result.roundId,
            gameId: "stilllife",
            teamId: entry.teamId,
            points: entry.points,
            reason: "Still Life composition, drama and environment",
            source: entry.manualOverride ? ("host-adjustment" as const) : ("ai-bonus" as const),
            rubric: {
              compositionScore: entry.compositionScore,
              dramaScore: entry.dramaScore,
              materialScore: entry.materialScore,
              audienceVotes: entry.audienceVotes,
              tieBreakWinner: result.winningTeamIds.includes(entry.teamId),
              aiFallback: entry.aiFallback,
            },
          },
        ],
  );
}

export async function finalizeStillLifeRound(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  allowNoVotes?: boolean;
  now?: number;
}) {
  const still = assertStillLifeRound(params.room.state, params.roundId);
  if (still.phase === "results" && still.result) return { still, result: still.result };
  if (still.phase !== "voting" || !still.headline) {
    throw statusError("Still Life voting is not ready", 409);
  }

  const resultKey = stillLifeResultIdempotencyKey(params.roundId);
  const existing = await findPartyRecordByIdempotency(params.room.id, resultKey);
  let resultRecord;
  if (existing) {
    resultRecord = stillLifeResultRecordSchema.parse(existing.payload);
  } else {
    const [judgments, votes] = await Promise.all([
      roundJudgments(params.room.id, params.roundId, params.room.state),
      roundVotes(params.room.id, params.roundId),
    ]);
    if (judgments.length < 2) throw statusError("Still Life judgments are incomplete", 409);
    if (votes.length === 0 && !params.allowNoVotes) {
      throw statusError("at least one audience ballot is required", 409);
    }
    const result = scoreStillLifeRound({
      roundId: params.roundId,
      headline: still.headline,
      judgments,
      votes,
    });
    const created = await createPartyRecord({
      roomId: params.room.id,
      state: params.room.state,
      input: {
        idempotencyKey: resultKey,
        runId: params.roundId,
        gameId: "stilllife",
        kind: STILL_LIFE_RESULT_KIND,
        visibility: "host",
        payload: { version: 1, result, completedAt: params.now ?? Date.now() },
      },
    });
    resultRecord = stillLifeResultRecordSchema.parse(created.row.payload);
  }

  const events = stillLifeScoreEvents(resultRecord.result);
  if (events.length > 0) {
    await awardScoreEvents({ roomId: params.room.id, state: params.room.state, events });
  }
  const updated = await updateStillLifeState(params.room.id, (state) =>
    finalizeStillLifeState(state, params.roundId, resultRecord.result),
  );
  return { still: updated.state.stilllife!, result: resultRecord.result };
}

export async function nextStillLifeRound(params: { room: AuthorizedHostRoom; roundId: string }) {
  const current = params.room.state.stilllife;
  if (
    params.room.state.currentGame === "stilllife" &&
    current &&
    current.roundId !== params.roundId &&
    current.roundResults.some((result) => result.roundId === params.roundId)
  ) {
    return { still: current };
  }
  assertStillLifeRound(params.room.state, params.roundId);
  const updated = await updateStillLifeState(params.room.id, (state) =>
    nextStillLifeRoundState(state, params.roundId),
  );
  return { still: updated.state.stilllife! };
}
