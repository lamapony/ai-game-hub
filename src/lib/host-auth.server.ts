import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RoomState } from "./types";

export type AuthorizedHostRoom = {
  id: string;
  code: string;
  state: RoomState;
};

function mergePlayersForHostWrite(current: RoomState, submitted: RoomState) {
  const currentById = new Map(current.players.map((player) => [player.id, player]));
  const submittedIds = new Set(submitted.players.map((player) => player.id));
  return [
    ...submitted.players.map((player) => {
      const currentPlayer = currentById.get(player.id);
      if (!currentPlayer?.secretHash || player.secretHash) return player;
      return { ...player, secretHash: currentPlayer.secretHash };
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
  if (!hostSecret) throw Object.assign(new Error("host authorization required"), { status: 401 });

  let query = supabaseAdmin.from("rooms").select("id, code, host_secret, state");
  if (params.roomId) {
    query = query.eq("id", params.roomId);
  } else if (params.code) {
    query = query.eq("code", params.code.trim().toUpperCase());
  } else {
    throw Object.assign(new Error("roomId or code required"), { status: 400 });
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("room not found"), { status: 404 });
  if (!timingSafeEqual(hostSecret, data.host_secret)) {
    throw Object.assign(new Error("invalid host secret"), { status: 403 });
  }

  return {
    id: data.id,
    code: data.code,
    state: data.state as unknown as RoomState,
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
