import type { RoomState } from "./types";
import {
  normalizePartyContext,
  normalizePartyStoryEvidence,
  type PartyContext,
} from "./party-context";

export const FINALE_EVIDENCE_VERSION = 1 as const;
export const FINALE_NARRATIVE_VERSION = 1 as const;
export const MAX_FINALE_EVIDENCE_ITEMS = 16;
export const FINALE_GENERATION_LEASE_MS = 45_000;

export type FinaleEvidenceItem = {
  id: string;
  gameId: string;
  title: string;
  detail: string;
};

function withStoryEvidence(party: PartyContext, evidence: FinaleEvidenceItem[]): PartyContext {
  if (party.experienceId === "classic-park") return party;
  const storyEvidence = normalizePartyStoryEvidence(evidence);
  if (JSON.stringify(party.storyEvidence ?? []) === JSON.stringify(storyEvidence)) return party;
  if (storyEvidence.length > 0) return { ...party, storyEvidence };
  const next = { ...party };
  delete next.storyEvidence;
  return next;
}

export type FinaleNarrative = {
  version: typeof FINALE_NARRATIVE_VERSION;
  headline: string;
  opening: string;
  callbacks: Array<{
    evidenceId: string;
    title: string;
    payoff: string;
  }>;
  closingToast: string;
};

export type FinaleState = {
  evidenceVersion: typeof FINALE_EVIDENCE_VERSION;
  evidenceCapturedAt: number;
  evidence: FinaleEvidenceItem[];
  narrative?: FinaleNarrative;
  generatedAt?: number;
  usedFallback?: boolean;
  generation?: {
    requestId: string;
    startedAt: number;
  };
};

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function evidenceId(gameId: string, value: unknown) {
  const suffix = boundedText(value, 48).replace(/[^a-zA-Z0-9_-]/g, "_") || "result";
  return `${gameId}:${suffix}`.slice(0, 80);
}

function playerName(state: RoomState, playerId: string, russian = false) {
  return (
    boundedText(state.players.find((player) => player.id === playerId)?.name, 48) ||
    (russian ? "Гость" : "A guest")
  );
}

function russianPlural(count: number, forms: readonly [string, string, string]) {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/**
 * Builds a bounded, public-only record of already revealed party events.
 * Deliberately never reads recording URLs, transcripts, hidden assignments, private records or cues.
 */
export function collectFinaleEvidence(state: RoomState): FinaleEvidenceItem[] {
  const items: FinaleEvidenceItem[] = [];
  const russian = state.party?.contentLocale === "ru";
  const add = (gameId: string, id: unknown, title: unknown, detail: unknown) => {
    const safeTitle = boundedText(title, 100);
    const safeDetail = boundedText(detail, 280);
    if (!safeTitle || !safeDetail || items.length >= MAX_FINALE_EVIDENCE_ITEMS) return;
    items.push({ id: evidenceId(gameId, id), gameId, title: safeTitle, detail: safeDetail });
  };

  const soundscape = state.soundscape;
  if (soundscape?.topic) {
    const teamCount = Object.keys(soundscape.mixes ?? {}).length;
    add(
      "soundscape",
      soundscape.roundId,
      `${russian ? "Звуковой баттл" : "Soundscape"}: ${soundscape.topic}`,
      russian
        ? teamCount > 0
          ? `${teamCount} ${russianPlural(teamCount, ["команда", "команды", "команд"])} ${teamCount === 1 ? "превратила" : "превратили"} эту локацию в общий саундтрек.`
          : "Несколько команд превратили эту локацию в общий саундтрек."
        : `${teamCount || "Several"} teams turned the venue into a shared soundtrack.`,
    );
  }

  const challenge = state.challenge;
  if (challenge?.result?.feedback) {
    add(
      "challenge",
      challenge.roundId,
      `${russian ? "Испытание" : "Challenge"}: ${boundedText(challenge.operatorName, 48) || (russian ? "оператор" : "the operator")}`,
      challenge.result.feedback,
    );
  }

  const photoWinner = state.phototunt?.results
    ?.slice()
    .sort((left, right) => left.rank - right.rank)[0];
  if (photoWinner?.comment) {
    add(
      "phototunt",
      state.phototunt?.roundId,
      `${russian ? "Фотоохота" : "Photo Hunt"}: ${photoWinner.playerName}`,
      photoWinner.comment,
    );
  }

  const track = state.trackguess?.roundResults?.at(-1);
  if (track) {
    const artist = boundedText(track.artist, 60);
    add(
      "trackguess",
      track.trackId,
      `${russian ? "Настоящее или AI?" : "Track Guess"}: ${track.title}`,
      russian
        ? `${track.correctPlayerIds.length} ${russianPlural(track.correctPlayerIds.length, ["гость", "гостя", "гостей"])} ${track.correctPlayerIds.length === 1 ? "распознал" : "распознали"} ${track.isAi ? "AI-трек" : "настоящий трек"}${artist ? ` исполнителя ${artist}` : ""}.`
        : `${track.correctPlayerIds.length} guests correctly called ${track.isAi ? "an AI track" : "a real track"}${artist ? ` by ${artist}` : ""}.`,
    );
  }

  const spectrum = state.spectrumcourt?.roundResults?.at(-1);
  if (spectrum?.clue) {
    add(
      "spectrumcourt",
      spectrum.spectrumId,
      `${russian ? "Суд Спектра" : "Spectrum Court"}: ${playerName(state, spectrum.cluePlayerId, russian)}`,
      russian
        ? `Подсказку «${spectrum.clue}» нужно было поставить между «${spectrum.leftLabel}» и «${spectrum.rightLabel}».`
        : `The clue “${spectrum.clue}” had to land between “${spectrum.leftLabel}” and “${spectrum.rightLabel}”.`,
    );
  }

  const whoAmong = state.whoamong?.roundResults?.at(-1);
  if (whoAmong?.prompt && whoAmong.starIds.length > 0) {
    add(
      "whoamong",
      whoAmong.promptId,
      russian ? "Кто из нас" : "Who Among Us",
      russian
        ? `${whoAmong.starIds.map((id) => playerName(state, id, russian)).join(" и ")} стали ответом комнаты на вопрос «${whoAmong.prompt}».`
        : `${whoAmong.starIds.map((id) => playerName(state, id, russian)).join(" and ")} became the room's answer to “${whoAmong.prompt}”.`,
    );
  }

  const impostor = state.impostor?.roundResults?.at(-1);
  if (impostor?.question) {
    add(
      "impostor",
      impostor.questionId,
      russian ? "Человек или AI" : "Human or AI",
      russian
        ? `${impostor.correctVoterIds.length} ${russianPlural(impostor.correctVoterIds.length, ["гость", "гостя", "гостей"])} ${impostor.correctVoterIds.length === 1 ? "нашёл" : "нашли"} синтетический ответ на вопрос «${impostor.question}».`
        : `${impostor.correctVoterIds.length} guests found the synthetic answer to “${impostor.question}”.`,
    );
  }

  const oracle = state.oracleMemory;
  if (oracle && oracle.verifiedPlayerIds.length > 0) {
    add(
      "grilloracle",
      oracle.runId,
      russian ? "Гриль-Оракул" : "The Grill Oracle",
      russian
        ? `${oracle.verifiedPlayerIds.length} ${russianPlural(oracle.verifiedPlayerIds.length, ["пророчество", "пророчества", "пророчеств"])} ${oracle.verifiedPlayerIds.length === 1 ? "дошло" : "дошли"} до публичного вердикта.`
        : `${oracle.verifiedPlayerIds.length} prophecies made it all the way to a public verdict.`,
    );
  }

  if (state.smokescreen?.recap) {
    add(
      "smokescreen",
      state.smokescreen.runId,
      russian ? "Дымовая Завеса" : "Smoke Screen",
      state.smokescreen.recap,
    );
  }

  const contraband = state.contraband?.results?.at(-1);
  if (contraband) {
    add(
      "contraband",
      `${state.contraband?.runId}_${contraband.playerId}`,
      `${russian ? "Контрабанда" : "Verbal Contraband"}: ${contraband.playerName}`,
      russian
        ? `Фраза «${contraband.phrase}» завершила дело: ${
            contraband.outcome === "caught"
              ? "поймана"
              : contraband.outcome === "clean"
                ? "оправдана"
                : "прошла незамеченной"
          }.`
        : `The phrase “${contraband.phrase}” ended the case as ${contraband.outcome}.`,
    );
  }

  const tongs = state.tongsoftruth?.roundResults.at(-1);
  if (tongs?.comment) {
    add(
      "tongsoftruth",
      tongs.roundId,
      `${russian ? "Щипцы Правды" : "Tongs of Truth"}: ${tongs.speakerName}`,
      tongs.comment,
    );
  }

  const toastRounds = state.toastsyndicate?.roundResults ?? [];
  if (toastRounds.length > 0) {
    const standout = toastRounds.reduce((best, candidate) =>
      candidate.speakerPoints > best.speakerPoints ? candidate : best,
    );
    const speakers = Array.from(
      new Set(toastRounds.map((round) => playerName(state, round.speakerPlayerId, russian))),
    ).slice(0, 5);
    const genres = Array.from(
      new Set(toastRounds.map((round) => boundedText(round.genre, 40))),
    ).slice(0, 4);
    add(
      "toastsyndicate",
      state.toastsyndicate?.sessionId ?? standout.roundId,
      russian
        ? `Синдикат Тостов: деклараций пропущено — ${toastRounds.length}`
        : `Toast Syndicate: ${toastRounds.length} declarations cleared`,
      russian
        ? `Публичных тостов на таможне: ${toastRounds.length}. Спикеры: ${speakers.join(", ")}. Жанры: ${genres.join(", ")}. Высший допуск: ${playerName(state, standout.speakerPlayerId, russian)}, ${standout.speakerPoints} очков. ${standout.comment}`
        : `${toastRounds.length} public toasts cleared customs. Speakers: ${speakers.join(", ")}. Genres: ${genres.join(", ")}. Highest clearance: ${playerName(state, standout.speakerPlayerId, russian)} with ${standout.speakerPoints} points. ${standout.comment}`,
    );
  }

  const stillLife = state.stilllife?.roundResults.at(-1);
  const stillLifeWinner = stillLife?.entries.find((entry) =>
    stillLife.winningTeamIds.includes(entry.teamId),
  );
  if (stillLife && stillLifeWinner) {
    add(
      "stilllife",
      stillLife.roundId,
      `${russian ? "Натюрморт" : "Still Life"}: ${stillLifeWinner.catalogTitle}`,
      russian
        ? `${stillLifeWinner.teamName} ответили на задание «${stillLife.headline}». ${stillLifeWinner.critique}`
        : `${stillLifeWinner.teamName} answered “${stillLife.headline}”. ${stillLifeWinner.critique}`,
    );
  }

  const sommelier = state.sommelier?.roundResults.at(-1);
  if (sommelier?.profile.owner_profile) {
    add(
      "sommelier",
      sommelier.entryId,
      `${russian ? "Сомелье Секретов" : "Sommelier of Secrets"}: ${sommelier.ownerPlayerName}`,
      sommelier.profile.owner_profile,
    );
  }

  const cross = state.crossexamination?.pairResults.at(-1);
  if (cross?.verdict) {
    add(
      "crossexamination",
      cross.pairId,
      `${russian ? "Перекрёстный Допрос" : "Cross-Examination"}: ${cross.playerAName} × ${cross.playerBName}`,
      cross.verdict,
    );
  }

  return items;
}

function mergeEvidence(current: FinaleEvidenceItem[], collected: FinaleEvidenceItem[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of collected) merged.set(item.id, item);
  return [...merged.values()].slice(-MAX_FINALE_EVIDENCE_ITEMS);
}

export function captureFinaleState(state: RoomState, now: number): FinaleState {
  const current = state.finale;
  const evidence = mergeEvidence(current?.evidence ?? [], collectFinaleEvidence(state));
  if (current && JSON.stringify(current.evidence) === JSON.stringify(evidence)) return current;
  return {
    evidenceVersion: FINALE_EVIDENCE_VERSION,
    evidenceCapturedAt: now,
    evidence,
  };
}

/** Persist revealed events before game state is replaced, cleared or handed back to the conductor. */
export function capturePartyEvidenceState(state: RoomState, now: number): RoomState {
  if (!state.finale && collectFinaleEvidence(state).length === 0) return state;
  const finale = captureFinaleState(state, now);
  const party = withStoryEvidence(normalizePartyContext(state.party, state.venue), finale.evidence);
  if (finale === state.finale && party === state.party) return state;
  return { ...state, finale, party };
}

export function latestPartyEvidence(state: RoomState) {
  return state.finale?.evidence.at(-1);
}

export function claimFinaleNarrativeState(
  state: RoomState,
  params: { requestId: string; now: number },
) {
  const finale = state.finale ?? captureFinaleState(state, params.now);
  if (finale.narrative) return { state, claimed: false, narrative: finale.narrative };
  const leaseActive =
    finale.generation && finale.generation.startedAt > params.now - FINALE_GENERATION_LEASE_MS;
  if (leaseActive) return { state: state.finale ? state : { ...state, finale }, claimed: false };
  return {
    state: {
      ...state,
      finale: {
        ...finale,
        generation: { requestId: params.requestId, startedAt: params.now },
      },
    },
    claimed: true,
  };
}

export function completeFinaleNarrativeState(
  state: RoomState,
  params: {
    requestId: string;
    narrative: FinaleNarrative;
    generatedAt: number;
    usedFallback: boolean;
  },
) {
  const finale = state.finale;
  if (!finale || finale.generation?.requestId !== params.requestId) return null;
  if (finale.narrative) return { state, narrative: finale.narrative, replayed: true };
  const next: FinaleState = {
    ...finale,
    narrative: params.narrative,
    generatedAt: params.generatedAt,
    usedFallback: params.usedFallback,
    generation: undefined,
  };
  return { state: { ...state, finale: next }, narrative: params.narrative, replayed: false };
}

export function releaseFinaleNarrativeClaim(state: RoomState, requestId: string) {
  if (state.finale?.generation?.requestId !== requestId) return state;
  return { ...state, finale: { ...state.finale, generation: undefined } };
}
