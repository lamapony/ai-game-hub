import {
  contextForExperience,
  getExperiencePack,
  getExperienceRoute,
  type RunOfShowStep,
} from "@/experiences/catalog";
import { getConductorLabels, getRunStepCue, getRunStepLabel } from "@/experiences/conductor";
import { GAME_IDS } from "@/games/ids";
import { getGame, type GameCapability } from "@/games/registry";
import {
  CONTINGENCY_PLANS,
  type ContingencyPlan,
  type ExperienceId,
  type PartyActId,
  type PartyLocale,
} from "./party-context";
import {
  QUICK_START_PROFILES,
  quickStartContingency,
  validateQuickStartInput,
  type QuickStartDuration,
  type QuickStartInput,
  type QuickStartVenue,
} from "./quick-start";
import { buildQuickStartBrief, type QuickStartEquipmentRequirement } from "./quick-start-brief";
import type { GameId } from "./types";

export type OperatorNightPackCueStep = {
  stepId: string;
  actId: PartyActId;
  kind: RunOfShowStep["kind"];
  label: string;
  cue: string;
  durationMinutes: number;
  optional: boolean;
  gameId?: GameId;
  capabilities?: readonly GameCapability[];
};

export type OperatorNightPackRecoveryRow = {
  symptom: string;
  hostAction: string;
  mustRemainIntact: string;
};

export type OperatorNightPackContingencyPreview = {
  contingency: ContingencyPlan;
  label: string;
  routeDurationMinutes: number;
  actOrder: readonly PartyActId[];
  stepCount: number;
  informational: true;
  liveRemapAvailable: false;
  note: string;
};

export type OperatorNightPack = {
  schemaVersion: 1;
  input: {
    venue: QuickStartVenue;
    targetDurationMinutes: QuickStartDuration;
    expectedPlayers: number;
    storySeedConfigured: boolean;
  };
  program: {
    experienceId: ExperienceId;
    title: string;
    contingency: ContingencyPlan;
    contingencyLabel: string;
    routeDurationMinutes: number;
    gameMoments: number;
    distinctGames: number;
    guidedBreaks: number;
    hasFinale: boolean;
  };
  cueSheet: OperatorNightPackCueStep[];
  essentials: readonly string[];
  equipment: QuickStartEquipmentRequirement[];
  recoveryPromise: string;
  recoveryCard: readonly OperatorNightPackRecoveryRow[];
  contingencyPreviews: OperatorNightPackContingencyPreview[];
  handoffReminder: {
    required: true;
    instruction: string;
    secretIncluded: false;
  };
  privacy: {
    containsHostSecret: false;
    containsPlayerIdentity: false;
    containsPrivateAssignments: false;
    containsTranscriptsOrMedia: false;
    containsScoreReasonsOrRubrics: false;
    containsStorySeedText: false;
    reviewBeforeSharing: true;
  };
};

const CONTINGENCY_PREVIEW_NOTE = "Choose this format before start. Live remap is not available.";

const MUST_REMAIN_INTACT =
  "Route progress, private records, and the score ledger must remain intact.";

/** Fixed, non-sensitive recovery paths already supported in Live safety / the host runbook. */
const RECOVERY_CARD: readonly OperatorNightPackRecoveryRow[] = [
  {
    symptom: "Network drops or the host screen stalls",
    hostAction: "Pause if needed, restore the network, then Resync from Live safety.",
    mustRemainIntact: MUST_REMAIN_INTACT,
  },
  {
    symptom: "AI or speech-to-text fails",
    hostAction: "Use manual fallbacks in Live safety, or skip the moment and continue the route.",
    mustRemainIntact: MUST_REMAIN_INTACT,
  },
  {
    symptom: "Camera or microphone is denied",
    hostAction: "Fix site permission on the phone, or skip that media phase and keep moving.",
    mustRemainIntact: MUST_REMAIN_INTACT,
  },
  {
    symptom: "Host device becomes unusable",
    hostAction:
      "On the trusted second device, open Live safety and use the private backup link prepared after room creation.",
    mustRemainIntact: MUST_REMAIN_INTACT,
  },
];

const HANDOFF_INSTRUCTION =
  "After the room is created, open Live safety and prepare the private backup link on a trusted second host device.";

function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

function buildCueSheet(
  steps: readonly RunOfShowStep[],
  locale: PartyLocale,
): OperatorNightPackCueStep[] {
  return steps.map((step) => {
    const base: OperatorNightPackCueStep = {
      stepId: step.id,
      actId: step.actId,
      kind: step.kind,
      label: getRunStepLabel(step, locale),
      cue: getRunStepCue(step, locale),
      durationMinutes: step.durationMinutes,
      optional: Boolean(step.optional),
    };
    if ("gameId" in step && isGameId(step.gameId)) {
      return {
        ...base,
        gameId: step.gameId,
        capabilities: getGame(step.gameId).capabilities,
      };
    }
    return base;
  });
}

function buildContingencyPreviews(
  experienceId: ExperienceId,
): OperatorNightPackContingencyPreview[] {
  const pack = getExperiencePack(experienceId);
  const previews: OperatorNightPackContingencyPreview[] = [];

  for (const contingency of CONTINGENCY_PLANS) {
    if (!(contingency in pack.routes)) continue;
    const route = pack.routes[contingency];
    const labels = getConductorLabels(contextForExperience(experienceId, contingency));
    previews.push({
      contingency,
      label: labels.contingencyLabel,
      routeDurationMinutes: route.steps.reduce((total, step) => total + step.durationMinutes, 0),
      actOrder: [...route.actOrder],
      stepCount: route.steps.length,
      informational: true,
      liveRemapAvailable: false,
      note: CONTINGENCY_PREVIEW_NOTE,
    });
  }

  return previews;
}

/**
 * Deterministic Operator Night Pack for professional hosts.
 * Pure, pre-room, and privacy-bounded — no clock, randomness, or live remap.
 */
export function buildOperatorNightPack(input: QuickStartInput): OperatorNightPack {
  const setup = validateQuickStartInput(input);
  const brief = buildQuickStartBrief(setup);
  const profile = QUICK_START_PROFILES[setup.venue];
  const contingency = quickStartContingency(setup.targetDurationMinutes);
  const experienceId = profile.experienceId;
  const context = contextForExperience(experienceId, contingency);
  const locale = context.uiLocale;
  const route = getExperienceRoute(experienceId, contingency);
  const labels = getConductorLabels(context);

  return {
    schemaVersion: 1,
    input: {
      venue: setup.venue,
      targetDurationMinutes: setup.targetDurationMinutes,
      expectedPlayers: setup.expectedPlayers,
      storySeedConfigured: Boolean(setup.storySeed),
    },
    program: {
      experienceId,
      title: labels.experienceTitle,
      contingency,
      contingencyLabel: labels.contingencyLabel,
      routeDurationMinutes: brief.routeDurationMinutes,
      gameMoments: brief.gameMoments,
      distinctGames: brief.distinctGames,
      guidedBreaks: brief.guidedBreaks,
      hasFinale: brief.hasFinale,
    },
    cueSheet: buildCueSheet(route.steps, locale),
    essentials: [...brief.essentials],
    equipment: brief.equipment.map((item) => ({ ...item })),
    recoveryPromise: brief.recoveryPromise,
    recoveryCard: RECOVERY_CARD,
    contingencyPreviews: buildContingencyPreviews(experienceId),
    handoffReminder: {
      required: true,
      instruction: HANDOFF_INSTRUCTION,
      secretIncluded: false,
    },
    privacy: {
      containsHostSecret: false,
      containsPlayerIdentity: false,
      containsPrivateAssignments: false,
      containsTranscriptsOrMedia: false,
      containsScoreReasonsOrRubrics: false,
      containsStorySeedText: false,
      reviewBeforeSharing: true,
    },
  };
}
