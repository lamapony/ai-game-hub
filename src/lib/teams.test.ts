import { describe, expect, test } from "bun:test";
import { emptyRoomState } from "./types";
import { addTeamToState, removeTeamFromState, renameTeamInState, suggestTeamName } from "./teams";

describe("team helpers", () => {
  test("suggestTeamName increments from current count", () => {
    const state = emptyRoomState();
    expect(suggestTeamName(state.teams)).toBe("Team 5");
  });

  test("addTeamToState appends a team with the next color", () => {
    const state = emptyRoomState();
    const next = addTeamToState(state, "Hedgehogs", "team_ezh");
    expect(next?.teams).toHaveLength(5);
    expect(next?.teams[4]).toEqual({
      id: "team_ezh",
      name: "Hedgehogs",
      color: "green",
      score: 0,
    });
  });

  test("renameTeamInState updates the team name", () => {
    const state = emptyRoomState();
    const next = renameTeamInState(state, "forest", "Forest Team");
    expect(next?.teams.find((t) => t.id === "forest")?.name).toBe("Forest Team");
  });

  test("removeTeamFromState refuses when players are assigned", () => {
    const state = {
      ...emptyRoomState(),
      players: [{ id: "p1", name: "V", teamId: "forest", joinedAt: 1 }],
    };
    expect(removeTeamFromState(state, "forest")).toBeNull();
  });

  test("removeTeamFromState drops empty teams but keeps at least one", () => {
    const state = emptyRoomState();
    expect(removeTeamFromState(state, "lake")).not.toBeNull();
    expect(removeTeamFromState({ ...state, teams: [state.teams[0]] }, "forest")).toBeNull();
  });
});
