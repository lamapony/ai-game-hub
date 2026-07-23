import { describe, expect, test } from "bun:test";
import type { CrossComparisonOutput } from "@/games/crossexamination/model";
import type { PartyRecordRow } from "./party-records";
import {
  CROSS_AUDIO_MAX_BYTES,
  crossEvidenceCandidateFromRow,
  crossFindingsFromComparison,
  crossPredictionKey,
  crossQuestionsKey,
  crossScoreKey,
  crossSelectionKey,
  crossTestimonyKey,
  crossVerdictKey,
} from "./crossexamination.server";
import type { CrossExaminationQuestion } from "./types";

function row(overrides: Partial<PartyRecordRow> = {}): PartyRecordRow {
  return {
    id: "record_1",
    room_id: "room_1",
    run_id: "run_1",
    game_id: "tongsoftruth",
    act_id: "grill",
    owner_player_id: "player_1",
    owner_team_id: null,
    kind: "tongs-testimony",
    visibility: "host",
    payload: {
      question: "Which plan burned first?",
      transcript: "The foil escaped before dinner.",
      storagePath: "room_1/tongsoftruth/round_1/player_1-secret.webm",
    },
    idempotency_key: "hidden",
    created_at: "2026-07-15T12:00:00.000Z",
    revealed_at: null,
    ...overrides,
    session_started_at: overrides.session_started_at ?? 1_234,
  };
}

const questions: CrossExaminationQuestion[] = [
  { questionId: "q1", category: "order", text: "What happened before the foil escaped?" },
  { questionId: "q2", category: "object", text: "Which object landed on the table?" },
  { questionId: "q3", category: "person", text: "Who first noticed the rain?" },
  { questionId: "q4", category: "detail", text: "Which small detail proved it?" },
];

describe("Cross Examination server invariants", () => {
  test("derives stable opaque keys without leaking raw identities", () => {
    const keys = [
      crossSelectionKey("run_secret"),
      crossQuestionsKey("run_secret", "pair_secret"),
      crossTestimonyKey("run_secret", "pair_secret", "player_secret"),
      crossPredictionKey("run_secret", "pair_secret", "player_secret"),
      crossVerdictKey("run_secret", "pair_secret"),
      crossScoreKey("run_secret", "pair_secret", "player_secret", "alibi"),
    ];
    expect(keys).toEqual([
      crossSelectionKey("run_secret"),
      crossQuestionsKey("run_secret", "pair_secret"),
      crossTestimonyKey("run_secret", "pair_secret", "player_secret"),
      crossPredictionKey("run_secret", "pair_secret", "player_secret"),
      crossVerdictKey("run_secret", "pair_secret"),
      crossScoreKey("run_secret", "pair_secret", "player_secret", "alibi"),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.length <= 128)).toBe(true);
    expect(keys.some((key) => /run_secret|pair_secret|player_secret/.test(key))).toBe(false);
  });

  test("curates a short real callback without forwarding storage paths", () => {
    const candidate = crossEvidenceCandidateFromRow(row());
    expect(candidate).not.toBeNull();
    if (!candidate) return;
    expect(candidate.title).toContain("Tongs testimony");
    expect(candidate.excerpt).toContain("foil escaped");
    expect(JSON.stringify(candidate).includes("secret.webm")).toBe(false);
    expect(JSON.stringify(candidate).includes("storagePath")).toBe(false);
    expect(
      crossEvidenceCandidateFromRow(row({ kind: "unknown", payload: { note: "secret" } })),
    ).toBeNull();
    expect(crossEvidenceCandidateFromRow(row({ visibility: "sealed" }))).toBeNull();
    expect(crossEvidenceCandidateFromRow(row({ visibility: "player" }))).toBeNull();
  });

  test("ignores AI severity and point proposals when producing public findings", () => {
    const comparison: CrossComparisonOutput = {
      contradictions: [
        {
          question: "What happened before the foil escaped?",
          versionA: "Dana rescued the foil",
          versionB: "Alex ordered another round",
          severity: 1,
        },
      ],
      alibi_strength: 10,
      verdict: "Model prose only.",
      pair_points: 10,
    };
    const findings = crossFindingsFromComparison(questions, comparison, "en");
    expect(findings.map((finding) => finding.severity)).toEqual([3, 0, 0, 0]);
    expect(findings[1]?.versionA).toBe("No material difference");
  });

  test("keeps audio processing within the shared upload ceiling", () => {
    expect(CROSS_AUDIO_MAX_BYTES).toBe(10_000_000);
    expect(CROSS_AUDIO_MAX_BYTES <= 10 * 1024 * 1024).toBe(true);
  });
});
