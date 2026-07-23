import { describe, expect, test } from "bun:test";
import { emptyRoomState, type RoomState } from "./types";
import { persistSoundscapeTopicsState, soundscapeTopicsForRound } from "./soundscape-topics";

function topicRoom(overrides: Partial<RoomState["soundscape"]> = {}): RoomState {
  return {
    ...emptyRoomState("Host"),
    currentGame: "soundscape",
    status: "playing",
    soundscape: {
      phase: "topics",
      roundId: "snd-1",
      ...overrides,
    },
  };
}

describe("server-authoritative Soundscape topics", () => {
  test("persists generated topics without replacing concurrent room state", () => {
    const state = { ...topicRoom(), recentHostCommandIds: ["cmd-1"] };
    const applied = persistSoundscapeTopicsState(state, {
      roundId: "snd-1",
      topics: ["Fire choir", "Bench conspiracy", "Wind on trial"],
      topicsEndsAt: 12_000,
    });

    expect(applied?.state.recentHostCommandIds).toEqual(["cmd-1"]);
    expect(applied?.state.soundscape?.phase).toBe("topics");
    expect(applied?.state.soundscape?.roundId).toBe("snd-1");
    expect(applied?.state.soundscape?.topics).toEqual([
      "Fire choir",
      "Bench conspiracy",
      "Wind on trial",
    ]);
    expect(applied?.state.soundscape?.topicVotes).toEqual({});
    expect(applied?.state.soundscape?.topicsEndsAt).toBe(12_000);
    expect(applied?.result.fallback).toBeUndefined();
  });

  test("is idempotent and keeps the first completed generation", () => {
    const state = topicRoom({
      topics: ["Original one", "Original two", "Original three"],
      topicsEndsAt: 8_000,
    });
    const applied = persistSoundscapeTopicsState(state, {
      roundId: "snd-1",
      topics: ["Replay one", "Replay two", "Replay three"],
      fallback: true,
      topicsEndsAt: 15_000,
    });

    expect(applied?.state).toBe(state);
    expect(applied?.result).toEqual({
      topics: ["Original one", "Original two", "Original three"],
      topicsEndsAt: 8_000,
    });
  });

  test("does not write into another round or a later phase", () => {
    const payload = {
      roundId: "snd-1",
      topics: ["One", "Two", "Three"],
      topicsEndsAt: 9_000,
    };
    expect(persistSoundscapeTopicsState(topicRoom({ roundId: "snd-2" }), payload)).toBeNull();
    expect(persistSoundscapeTopicsState(topicRoom({ phase: "recording" }), payload)).toBeNull();
  });

  test("reads fallback metadata only for the matching completed round", () => {
    const state = topicRoom({
      topics: ["One", "Two", "Three"],
      topicsEndsAt: 9_000,
      aiFallback: true,
    });
    expect(soundscapeTopicsForRound(state, "snd-1")).toEqual({
      topics: ["One", "Two", "Three"],
      fallback: true,
      topicsEndsAt: 9_000,
    });
    expect(soundscapeTopicsForRound(state, "snd-2")).toBeNull();
  });
});
