import { contextForExperience, getExperienceAct, getExperienceRoute } from "@/experiences/catalog";
import {
  ROOM_STATE_SCHEMA_VERSION,
  type ContingencyPlan,
  type ExperienceId,
  type PartyActId,
  type VenueKind,
} from "./party-context";
import type { RoomState, Venue } from "./types";

function legacyVenueFor(venue: VenueKind): Venue {
  return venue === "bar" ? "bar" : "park";
}

export function selectExperienceState(
  state: RoomState,
  experienceId: ExperienceId,
  contingency: ContingencyPlan,
  now: number,
): RoomState {
  const party = contextForExperience(experienceId, contingency);
  return {
    ...state,
    schemaVersion: ROOM_STATE_SCHEMA_VERSION,
    party: {
      ...party,
      sessionStartedAt: state.party?.sessionStartedAt ?? now,
      actStartedAt: now,
    },
    quickStart: undefined,
    runOfShow: { experienceId, contingency, completedStepIds: [] },
    finale: undefined,
    venue: legacyVenueFor(party.venue),
  };
}

export function selectPartyActState(
  state: RoomState,
  actId: PartyActId,
  now: number,
): RoomState | null {
  const party = state.party;
  if (!party) return null;
  const route = getExperienceRoute(party.experienceId, party.contingency);
  if (!route.actOrder.includes(actId)) return null;
  const act = getExperienceAct(party.experienceId, actId);
  if (!act) return null;

  return {
    ...state,
    schemaVersion: ROOM_STATE_SCHEMA_VERSION,
    party: { ...party, actId, venue: act.venue, actStartedAt: now },
    runOfShow: state.runOfShow
      ? {
          ...state.runOfShow,
          activeStepId: undefined,
          activeStepStartedAt: undefined,
        }
      : undefined,
    venue: legacyVenueFor(act.venue),
  };
}
