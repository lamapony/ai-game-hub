import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { legacyPartyContext } from "../party-context";
import {
  classicChallengeJudgementSpec,
  classicChallengeTaskSpec,
  partyChallengeJudgementSpec,
  partyChallengeTaskSpec,
} from "./challenge.prompts";
import {
  classicImpostorAnswerSpec,
  classicImpostorQuestionSpec,
  classicImpostorRevealSpec,
  partyImpostorAnswerSpec,
  partyImpostorQuestionSpec,
  partyImpostorRevealSpec,
} from "./impostor.prompts";
import {
  classicPhotoJudgementSpec,
  classicPhotoTaskSpec,
  partyPhotoJudgementSpec,
  partyPhotoTaskSpec,
} from "./phototunt.prompts";
import type { PromptSpec } from "./prompt-contract";
import { grillOracleReadingSpec } from "./grilloracle.prompts";
import { grillOracleVerificationSpec } from "./grilloracle-verification.prompts";
import { smokeScreenGenerationSpec, smokeScreenRecapSpec } from "./smokescreen.prompts";
import { toastAssignmentSpec, toastJudgmentSpec } from "./toastsyndicate.prompts";
import { stillLifeHeadlineSpec, stillLifeJudgmentSpec } from "./stilllife.prompts";
import { sommelierVisionSpec } from "./sommelier.prompts";
import { contrabandArbitrationSpec, contrabandGenerationSpec } from "./contraband.prompts";
import { tongsJudgmentSpec, tongsQuestionSpec } from "./tongsoftruth.prompts";
import { crossComparisonSpec, crossQuestionsSpec } from "./crossexamination.prompts";
import { finaleNarrativeSpec } from "./finale.prompts";
import {
  classicSoundscapeJudgmentSpec,
  classicSoundscapeMixSpec,
  classicSoundscapeTopicsSpec,
  partySoundscapeJudgmentSpec,
  partySoundscapeMixSpec,
  partySoundscapeTopicsSpec,
} from "./soundscape.prompts";

function smokeSpec<TInput, TOutput>(
  spec: PromptSpec<TInput, TOutput>,
  input: TInput,
  context: Parameters<PromptSpec<TInput, TOutput>["buildSystem"]>[0],
) {
  expect(spec.id.length > 0).toBe(true);
  expect(spec.version > 0).toBe(true);
  expect(spec.buildSystem(context).length > 0).toBe(true);
  const user = spec.buildUser(input, context);
  expect(user.length > 0).toBe(true);
  expect(spec.outputSchema.safeParse(spec.fallback(input, context)).success).toBe(true);
}

describe("adapted prompt smoke", () => {
  test("every classic and party operation builds and has a schema-valid fallback", () => {
    const classic = legacyPartyContext("park");
    const party = contextForExperience("smoke-neon-norrebro", "normal");
    const judgeInput = {
      task: "Task",
      transcript: "Transcript",
      frames: ["data:image/jpeg;base64,AA"],
      operatorName: "Dana",
    };
    const photoInput = {
      task: "Photo task",
      photos: [{ playerId: "p1", playerName: "Dana", url: "https://example.test/1.jpg" }],
    };
    const answerInput = { question: "Question?", humanAnswers: ["human answer"] };
    const revealInput = {
      question: "Question?",
      aiAnswer: "answer",
      caughtCount: 1,
      totalVoters: 4,
    };

    smokeSpec(classicChallengeTaskSpec, { operatorName: "Dana", pastTasks: [] }, classic);
    smokeSpec(partyChallengeTaskSpec, { operatorName: "Dana", pastTasks: [] }, party);
    smokeSpec(classicChallengeJudgementSpec, judgeInput, classic);
    smokeSpec(partyChallengeJudgementSpec, judgeInput, party);
    smokeSpec(classicPhotoTaskSpec, { pastTasks: [] }, classic);
    smokeSpec(partyPhotoTaskSpec, { pastTasks: [] }, party);
    smokeSpec(classicPhotoJudgementSpec, photoInput, classic);
    smokeSpec(partyPhotoJudgementSpec, photoInput, party);
    smokeSpec(classicImpostorQuestionSpec, { pastQuestions: [] }, classic);
    smokeSpec(partyImpostorQuestionSpec, { pastQuestions: [] }, party);
    smokeSpec(classicImpostorAnswerSpec, answerInput, classic);
    smokeSpec(partyImpostorAnswerSpec, answerInput, party);
    smokeSpec(classicImpostorRevealSpec, revealInput, classic);
    smokeSpec(partyImpostorRevealSpec, revealInput, party);
    smokeSpec(
      grillOracleReadingSpec,
      { playerName: "Dana", imageUrl: "https://example.test/oracle.jpg" },
      party,
    );
    const toastContext = { ...party, actId: "bar" as const, venue: "bar" as const };
    const toastAssignment = toastAssignmentSpec.fallback(
      { seed: 7, recentGenreIds: [], recentWordIds: [] },
      toastContext,
    );
    smokeSpec(
      toastAssignmentSpec,
      { seed: 7, recentGenreIds: [], recentWordIds: [] },
      toastContext,
    );
    smokeSpec(
      toastJudgmentSpec,
      {
        playerName: "Dana",
        assignment: toastAssignment,
        transcript: "A brief toast.",
        caughtWords: [],
      },
      toastContext,
    );
    smokeSpec(
      grillOracleVerificationSpec,
      {
        playerName: "Dana",
        predictions: ["One", "Two", "Three"],
        results: [true, false, true],
      },
      { ...party, actId: "bar", venue: "bar" },
    );
    smokeSpec(smokeScreenGenerationSpec, { count: 3, existingMissionTexts: [] }, party);
    smokeSpec(
      smokeScreenRecapSpec,
      {
        results: [
          {
            player: "Dana",
            mission: "Pass the ketchup without words",
            wasCaught: false,
            topSuspect: "Dana",
          },
        ],
        bestDetective: "Alex",
      },
      { ...party, actId: "bar", venue: "bar" },
    );
    smokeSpec(stillLifeHeadlineSpec, { seed: 1, recentHeadlines: [] }, party);
    smokeSpec(
      stillLifeJudgmentSpec,
      {
        teamName: "Forest",
        headline: "Последний огурец покидает лодку",
        imageUrl: "https://example.test/still.jpg",
        seed: 1,
      },
      party,
    );
    smokeSpec(
      sommelierVisionSpec,
      { imageUrl: "https://example.test/drink.jpg", seed: 7 },
      toastContext,
    );
    smokeSpec(contrabandGenerationSpec, { count: 3, seed: 7, recentPhrases: [] }, toastContext);
    smokeSpec(
      contrabandArbitrationSpec,
      {
        playerName: "Dana",
        phrase: "I generally trust ducks",
        transcript: "The menu has a duck on it, and I generally trust ducks.",
      },
      toastContext,
    );
    smokeSpec(
      tongsQuestionSpec,
      { playerName: "Dana", level: 2, seed: 7, recentQuestions: [] },
      party,
    );
    smokeSpec(
      tongsJudgmentSpec,
      {
        playerName: "Dana",
        level: 2,
        question: "Which plan burned first?",
        transcript: "The foil escaped in the wind, exactly like my travel plan last Tuesday.",
      },
      party,
    );
    smokeSpec(
      crossQuestionsSpec,
      {
        pairAName: "Dana",
        pairBName: "Alex",
        evidence: [{ tag: "foil", fact: "Wind carried the foil into a glass." }],
        previousQuestions: [],
      },
      toastContext,
    );
    smokeSpec(
      crossComparisonSpec,
      {
        pairAName: "Dana",
        pairBName: "Alex",
        questions: [
          { questionId: "q1", category: "order", text: "What happened before the foil moved?" },
          { questionId: "q2", category: "object", text: "Which object fell?" },
          { questionId: "q3", category: "person", text: "Who noticed first?" },
          { questionId: "q4", category: "detail", text: "Which detail proves it?" },
        ],
        transcriptA: "The wind moved the foil into a glass.",
        transcriptB: "The foil hit a glass after the wind picked up.",
      },
      toastContext,
    );
    smokeSpec(
      finaleNarrativeSpec,
      {
        playerCount: 8,
        teamNames: ["Forest", "Lake"],
        evidence: [
          {
            id: "toastsyndicate:round_1",
            gameId: "toastsyndicate",
            title: "The toast",
            detail: "One glass became Exhibit A.",
          },
        ],
      },
      { ...party, actId: "finale" },
    );
    const soundscapeMixInput = {
      teamName: "Forest",
      topic: "The kettle argued with an open window",
      clips: [
        {
          url: "https://example.test/kettle.webm",
          transcript: "A kettle whistles while a spoon taps twice.",
          durationMs: 2_400,
          playerName: "Dana",
        },
      ],
      speakerSlots: "slot 1 = host, slot 2 = left, slot 3 = right, slot 4 = rear, slot 5 = far",
    };
    const soundscapeJudgmentInput = {
      teamName: "Forest",
      topic: soundscapeMixInput.topic,
      clipsSummary: "A kettle whistle, two spoon taps, then wind through a window.",
    };
    smokeSpec(classicSoundscapeTopicsSpec, {}, classic);
    smokeSpec(partySoundscapeTopicsSpec, {}, party);
    smokeSpec(classicSoundscapeMixSpec, soundscapeMixInput, classic);
    smokeSpec(partySoundscapeMixSpec, soundscapeMixInput, party);
    smokeSpec(classicSoundscapeJudgmentSpec, soundscapeJudgmentInput, classic);
    smokeSpec(partySoundscapeJudgmentSpec, soundscapeJudgmentInput, party);
  });

  test("prompt ids are unique across the adapted surface", () => {
    const specs = [
      classicChallengeTaskSpec,
      partyChallengeTaskSpec,
      classicChallengeJudgementSpec,
      partyChallengeJudgementSpec,
      classicPhotoTaskSpec,
      partyPhotoTaskSpec,
      classicPhotoJudgementSpec,
      partyPhotoJudgementSpec,
      classicImpostorQuestionSpec,
      partyImpostorQuestionSpec,
      classicImpostorAnswerSpec,
      partyImpostorAnswerSpec,
      classicImpostorRevealSpec,
      partyImpostorRevealSpec,
      grillOracleReadingSpec,
      grillOracleVerificationSpec,
      smokeScreenGenerationSpec,
      smokeScreenRecapSpec,
      toastAssignmentSpec,
      toastJudgmentSpec,
      stillLifeHeadlineSpec,
      stillLifeJudgmentSpec,
      sommelierVisionSpec,
      contrabandGenerationSpec,
      contrabandArbitrationSpec,
      tongsQuestionSpec,
      tongsJudgmentSpec,
      crossQuestionsSpec,
      crossComparisonSpec,
      finaleNarrativeSpec,
      classicSoundscapeTopicsSpec,
      partySoundscapeTopicsSpec,
      classicSoundscapeMixSpec,
      partySoundscapeMixSpec,
      classicSoundscapeJudgmentSpec,
      partySoundscapeJudgmentSpec,
    ];
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(specs.length);
  });
});
