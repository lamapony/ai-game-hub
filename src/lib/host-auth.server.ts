import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mergeRecentHostCommandIds } from "./host-command";
import { migrateRoomState } from "./room-state-migration";
import { statusError } from "./player-auth.server";
import type { RoomState } from "./types";

export type AuthorizedHostRoom = {
  id: string;
  code: string;
  state: RoomState;
  updatedAt: string;
};

function mergePlayersForHostWrite(current: RoomState, submitted: RoomState) {
  const currentById = new Map(current.players.map((player) => [player.id, player]));
  const submittedIds = new Set(submitted.players.map((player) => player.id));
  return [
    ...submitted.players.map((player) => {
      const currentPlayer = currentById.get(player.id);
      if (!currentPlayer) return player;
      return {
        ...player,
        ...(!player.secretHash && currentPlayer.secretHash
          ? { secretHash: currentPlayer.secretHash }
          : {}),
        ...(currentPlayer.deviceCheck &&
        (!player.deviceCheck || currentPlayer.deviceCheck.checkedAt > player.deviceCheck.checkedAt)
          ? { deviceCheck: currentPlayer.deviceCheck }
          : {}),
      };
    }),
    ...current.players.filter((player) => !submittedIds.has(player.id)),
  ];
}

function mergeSpeakerSlotsForHostWrite(current: RoomState, submitted: RoomState) {
  const slots = { ...submitted.speakerSlots };
  for (const [slotKey, currentSlot] of Object.entries(current.speakerSlots ?? {})) {
    const slot = Number(slotKey);
    const submittedSlot = slots[slot];
    const currentSeen = currentSlot.lastSeenAt ?? 0;
    const submittedSeen = submittedSlot?.lastSeenAt ?? 0;
    if (!submittedSlot || currentSeen > submittedSeen) slots[slot] = currentSlot;
  }
  return slots;
}

function sameRoundPhase(
  current: { roundId: string; phase: string } | undefined,
  submitted: { roundId: string; phase: string } | undefined,
) {
  return (
    !!current &&
    !!submitted &&
    current.roundId === submitted.roundId &&
    current.phase === submitted.phase
  );
}

function mergeRecord<T>(
  current: Record<string, T> | undefined,
  submitted: Record<string, T> | undefined,
) {
  if (!current) return submitted;
  return { ...(submitted ?? {}), ...current };
}

function mergeArraySet(current: string[] | undefined, submitted: string[] | undefined) {
  if (!current) return submitted;
  return [...new Set([...(submitted ?? []), ...current])];
}

function mergeActiveRoundPlayerData(current: RoomState, submitted: RoomState): RoomState {
  if (current.currentGame !== submitted.currentGame) return submitted;

  if (
    current.currentGame === "toastsyndicate" &&
    current.toastsyndicate &&
    submitted.toastsyndicate &&
    current.toastsyndicate.roundId === submitted.toastsyndicate.roundId
  ) {
    return { ...submitted, toastsyndicate: current.toastsyndicate };
  }

  if (
    current.currentGame === "stilllife" &&
    current.stilllife &&
    submitted.stilllife &&
    current.stilllife.roundId === submitted.stilllife.roundId
  ) {
    return { ...submitted, stilllife: current.stilllife };
  }

  if (
    current.currentGame === "sommelier" &&
    current.sommelier &&
    submitted.sommelier &&
    current.sommelier.sessionId === submitted.sommelier.sessionId
  ) {
    return { ...submitted, sommelier: current.sommelier };
  }

  if (
    current.currentGame === "soundscape" &&
    sameRoundPhase(current.soundscape, submitted.soundscape)
  ) {
    return {
      ...submitted,
      soundscape: {
        ...submitted.soundscape!,
        topicVotes: mergeRecord(current.soundscape?.topicVotes, submitted.soundscape?.topicVotes),
      },
    };
  }

  if (
    current.currentGame === "phototunt" &&
    sameRoundPhase(current.phototunt, submitted.phototunt)
  ) {
    return {
      ...submitted,
      phototunt: {
        ...submitted.phototunt!,
        submittedPlayerIds: mergeArraySet(
          current.phototunt?.submittedPlayerIds,
          submitted.phototunt?.submittedPlayerIds,
        ),
      },
    };
  }

  if (
    current.currentGame === "grilloracle" &&
    current.grilloracle &&
    submitted.grilloracle &&
    current.grilloracle.roundId === submitted.grilloracle.roundId
  ) {
    const currentClosed = current.grilloracle.phase === "results";
    const submittedClosed = submitted.grilloracle.phase === "results";
    return {
      ...submitted,
      grilloracle: {
        ...submitted.grilloracle!,
        phase: currentClosed || submittedClosed ? "results" : "capturing",
        participantIds: current.grilloracle.participantIds,
        submittedPlayerIds:
          mergeArraySet(
            current.grilloracle?.submittedPlayerIds,
            submitted.grilloracle?.submittedPlayerIds,
          ) ?? [],
        captureEndsAt: currentClosed
          ? current.grilloracle.captureEndsAt
          : submitted.grilloracle.captureEndsAt,
      },
    };
  }

  if (
    current.currentGame === "trackguess" &&
    sameRoundPhase(current.trackguess, submitted.trackguess)
  ) {
    return {
      ...submitted,
      trackguess: {
        ...submitted.trackguess!,
        guesses: mergeRecord(current.trackguess?.guesses, submitted.trackguess?.guesses),
      },
    };
  }

  if (
    current.currentGame === "spectrumcourt" &&
    sameRoundPhase(current.spectrumcourt, submitted.spectrumcourt)
  ) {
    return {
      ...submitted,
      spectrumcourt: {
        ...submitted.spectrumcourt!,
        clue: current.spectrumcourt?.clue ?? submitted.spectrumcourt?.clue,
        cluePlayerId: current.spectrumcourt?.cluePlayerId ?? submitted.spectrumcourt?.cluePlayerId,
        guesses: mergeRecord(current.spectrumcourt?.guesses, submitted.spectrumcourt?.guesses),
        appeals: mergeRecord(current.spectrumcourt?.appeals, submitted.spectrumcourt?.appeals),
      },
    };
  }

  if (current.currentGame === "whoamong" && sameRoundPhase(current.whoamong, submitted.whoamong)) {
    return {
      ...submitted,
      whoamong: {
        ...submitted.whoamong!,
        votes: mergeRecord(current.whoamong?.votes, submitted.whoamong?.votes),
      },
    };
  }

  if (current.currentGame === "impostor" && sameRoundPhase(current.impostor, submitted.impostor)) {
    return {
      ...submitted,
      impostor: {
        ...submitted.impostor!,
        answers: mergeRecord(current.impostor?.answers, submitted.impostor?.answers),
        votes: mergeRecord(current.impostor?.votes, submitted.impostor?.votes),
      },
    };
  }

  return submitted;
}

export function mergeHostSubmittedState(current: RoomState, submitted: RoomState): RoomState {
  const mergedActiveRound = mergeActiveRoundPlayerData(current, submitted);
  return {
    ...mergedActiveRound,
    party: current.party ?? mergedActiveRound.party,
    quickStart: current.quickStart ?? mergedActiveRound.quickStart,
    aiRuntime: current.aiRuntime ?? mergedActiveRound.aiRuntime,
    status: current.status === "finished" ? "finished" : mergedActiveRound.status,
    runOfShow: current.runOfShow ?? mergedActiveRound.runOfShow,
    finale: current.finale ?? mergedActiveRound.finale,
    oracleMemory: current.oracleMemory ?? mergedActiveRound.oracleMemory,
    smokescreen: current.smokescreen ?? mergedActiveRound.smokescreen,
    contraband: current.contraband ?? mergedActiveRound.contraband,
    tongsoftruth: current.tongsoftruth ?? mergedActiveRound.tongsoftruth,
    crossexamination:
      mergedActiveRound.currentGame === "crossexamination"
        ? (current.crossexamination ?? mergedActiveRound.crossexamination)
        : mergedActiveRound.crossexamination,
    recentHostCommandIds: mergeRecentHostCommandIds(
      mergedActiveRound.recentHostCommandIds,
      current.recentHostCommandIds,
    ),
    players: mergePlayersForHostWrite(current, mergedActiveRound),
    speakerSlots: mergeSpeakerSlotsForHostWrite(current, mergedActiveRound),
  };
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function hostSecretFromRequest(request: Request, body: { hostSecret?: unknown }) {
  const header = request.headers.get("x-host-secret");
  if (header?.trim()) return header.trim();
  return typeof body.hostSecret === "string" ? body.hostSecret.trim() : "";
}

export async function authorizeHostRoom(params: {
  roomId?: string;
  code?: string;
  hostSecret: string;
}): Promise<AuthorizedHostRoom> {
  const hostSecret = params.hostSecret.trim();
  if (!hostSecret) throw statusError("host authorization required", 401);

  let query = supabaseAdmin.from("rooms").select("id, code, host_secret, state, updated_at");
  if (params.roomId) {
    query = query.eq("id", params.roomId);
  } else if (params.code) {
    query = query.eq("code", params.code.trim().toUpperCase());
  } else {
    throw statusError("roomId or code required", 400);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  if (!timingSafeEqual(hostSecret, data.host_secret)) {
    throw statusError("invalid host secret", 403);
  }

  return {
    id: data.id,
    code: data.code,
    state: migrateRoomState(data.state as unknown as RoomState),
    updatedAt: data.updated_at,
  };
}

export async function writeAuthorizedRoomState(
  roomId: string,
  state: RoomState,
  currentState?: RoomState,
) {
  const stateToWrite = currentState ? mergeHostSubmittedState(currentState, state) : state;
  const { error } = await supabaseAdmin
    .from("rooms")
    .update({ state: stateToWrite as never })
    .eq("id", roomId);
  if (error) throw error;
  return stateToWrite;
}
