import type { RoomState } from "./types";

export const MIN_ROOM_PLAYERS = 8;
export const MAX_ROOM_PLAYERS = 30;

export function roomHasPlayerCapacity(playerCount: number) {
  return playerCount < MAX_ROOM_PLAYERS;
}

export function canRemovePlayerBeforeParty(
  state: Pick<RoomState, "quickStart" | "runOfShow" | "status">,
) {
  return (
    state.status === "lobby" &&
    !state.quickStart?.startedAt &&
    !state.runOfShow?.activeStepId &&
    (state.runOfShow?.completedStepIds.length ?? 0) === 0
  );
}
