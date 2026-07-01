import { describe, expect, test } from "bun:test";
import {
  sanitizeChallengeJudgement,
  sanitizeMixJudgement,
  sanitizeMixResponse,
  sanitizePhotoRanking,
  sanitizeTask,
  sanitizeTopics,
} from "./sanitize";

describe("AI response sanitizers", () => {
  test("sanitizeTopics trims, dedupes and fills missing topics from fallback", () => {
    const topics = sanitizeTopics(
      { topics: ["  Rain Choir  ", "", "rain choir", 42, "Bench Trial"] },
      ["Mushroom disco", "Bench Trial", "Leaf court"],
    );

    expect(topics.length).toBe(3);
    expect(topics[0]).toBe("Rain Choir");
    expect(topics[1]).toBe("Bench Trial");
    expect(topics[2]).toBe("Mushroom disco");
  });

  test("sanitizeTask falls back only for missing fields", () => {
    const task = sanitizeTask(
      { task: "  Dance like a lost monument  ", intro: "" },
      { task: "Fallback task", intro: "Fallback intro" },
    );

    expect(task.task).toBe("Dance like a lost monument");
    expect(task.intro).toBe("Fallback intro");
  });

  test("sanitizeChallengeJudgement clamps scores and fills text", () => {
    const judgement = sanitizeChallengeJudgement({ score: 100, feedback: "", verdict: "" });

    expect(judgement.score).toBe(10);
    expect(judgement.feedback).toBe("Молча принято.");
    expect(judgement.verdict).toBe("10 из 10. Идём дальше.");
  });

  test("sanitizeMixResponse clamps cues, skips invalid clips and sorts by time", () => {
    const mix = sanitizeMixResponse(
      {
        intro: "",
        total_ms: 999999,
        score: [
          { at_ms: 70000, clip_index: 0, slot: 9 },
          { at_ms: 1000, clip_index: 99, slot: 3 },
          { at_ms: "2500", speak: "  Oak says hello  ", slot: 1 },
          { at_ms: -10, clip_index: 1, slot: 4 },
        ],
      },
      [
        { url: "https://example.test/a.webm", durationMs: 1200 },
        { url: "https://example.test/b.webm", durationMs: 1500 },
      ],
      "Forest",
    );

    expect(mix.intro).toBe("Team Forest, the park is listening.");
    expect(mix.totalMs).toBe(60000);
    expect(mix.cues.length).toBe(3);
    expect(mix.cues[0]?.atMs).toBe(0);
    expect(mix.cues[0]?.slot).toBe(4);
    expect(mix.cues[1]?.type).toBe("tts");
    expect(mix.cues[1]?.slot).toBe(2);
    expect(mix.cues[1]?.text).toBe("Oak says hello");
    expect(mix.cues[2]?.atMs).toBe(58000);
    expect(mix.cues[2]?.slot).toBe(5);
  });

  test("sanitizeMixJudgement clamps bonus and fills feedback", () => {
    const judgement = sanitizeMixJudgement({ feedback: "", bonus: -5 }, "Lake");

    expect(judgement.feedback).toBe("Team Lake made the park react.");
    expect(judgement.bonus).toBe(0);
  });

  test("sanitizePhotoRanking drops unknown players, dedupes and appends missing players", () => {
    const result = sanitizePhotoRanking(
      {
        ranking: [
          { playerId: "ghost", rank: 1, comment: "nope" },
          { playerId: "p2", rank: 1, comment: "  Sharp photo  " },
          { playerId: "p2", rank: 2, comment: "duplicate" },
          { playerId: "p1", rank: "bad", comment: "" },
        ],
        verdict: "",
      },
      [
        { playerId: "p1", playerName: "One" },
        { playerId: "p2", playerName: "Two" },
        { playerId: "p3", playerName: "Three" },
      ],
    );

    expect(result.verdict).toBe("Ну, кто-то выиграл, кто-то нет. Идём дальше.");
    expect(result.ranking.length).toBe(3);
    expect(result.ranking[0]?.playerId).toBe("p2");
    expect(result.ranking[0]?.rank).toBe(1);
    expect(result.ranking[0]?.comment).toBe("Sharp photo");
    expect(result.ranking[1]?.playerId).toBe("p1");
    expect(result.ranking[1]?.rank).toBe(2);
    expect(result.ranking[1]?.comment).toBe("Дух парка промолчал.");
    expect(result.ranking[2]?.playerId).toBe("p3");
    expect(result.ranking[2]?.rank).toBe(3);
    expect(result.ranking[2]?.comment).toBe("Дух парка проглядел тебя.");
  });
});
