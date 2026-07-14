import { ROOM_STATE_SCHEMA_VERSION, isPartyContext, normalizePartyContext } from "./party-context";
import type { RoomState } from "./types";

/** Adds the V2 party context without rewriting legacy game substates. */
export function migrateRoomState(state: RoomState): RoomState {
  const candidate = state as RoomState & {
    schemaVersion?: unknown;
    party?: unknown;
  };

  if (candidate.schemaVersion === ROOM_STATE_SCHEMA_VERSION && isPartyContext(candidate.party)) {
    return state;
  }

  return {
    ...state,
    schemaVersion: ROOM_STATE_SCHEMA_VERSION,
    party: normalizePartyContext(candidate.party, state.venue),
  };
}
