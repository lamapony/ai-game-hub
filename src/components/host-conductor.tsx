import { useEffect, useRef, useState } from "react";
import {
  contextForExperience,
  getExperienceAct,
  getExperiencePack,
  getExperienceRoute,
  type RunOfShowStep,
} from "@/experiences/catalog";
import {
  buildActTimeline,
  buildRouteTimeline,
  formatActElapsed,
  getConductorLabels,
  getNextActionableRouteStep,
  getNextExperienceAct,
  getNextIncompleteRouteStep,
  getRouteDurationMinutes,
  getRunStepCue,
  getRunStepLabel,
  getRunStepStoryBridge,
  getRunStepStoryOpening,
} from "@/experiences/conductor";
import {
  getGame,
  getGameAvailability,
  getRecommendedGames,
  type GameAvailability,
  type GameDefinition,
} from "@/games/registry";
import { GAME_IDS } from "@/games/ids";
import type { AiPreparedMeta } from "@/lib/ai-budget";
import {
  aiPrewarmCacheKey,
  autoAiPrewarmAttemptKey,
  isAiPrewarmGameId,
  type AiPrewarmGameId,
} from "@/lib/ai-prewarm";
import { latestPartyEvidence } from "@/lib/finale-narrative";
import { friendlyHostActionError } from "@/lib/host-action-errors";
import {
  EXPERIENCE_IDS,
  type ContingencyPlan,
  type ExperienceId,
  type PartyActId,
  type PartyContext,
  type PartyStoryEvidenceItem,
} from "@/lib/party-context";
import type { GameId, RoomState } from "@/lib/types";
import { GrillOracleLifecycleHost } from "@/games/grilloracle/LifecycleHost";
import { GameRulesDialogTrigger } from "./game-rules-ui";

type HostConductorProps = {
  roomId: string;
  state: RoomState;
  onLaunchGame: (gameId: GameId) => void;
  onSelectExperience: (experienceId: ExperienceId, contingency: ContingencyPlan) => void;
  onSelectAct: (actId: PartyActId) => void;
  onFinishParty: () => void;
  onPrepareAi: (gameId: AiPrewarmGameId, targetActId: PartyActId) => Promise<void>;
  onBeginRouteStep: (stepId: string) => void;
  onCompleteRouteStep: (stepId: string) => void;
};

const THEME_CLASSES = {
  classic: "is-classic",
  grill: "is-grill",
  transition: "is-transition",
  bar: "is-bar",
  home: "is-home",
  festival: "is-festival",
  finale: "is-finale",
} as const;

function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

function isPlayableStep(step: RunOfShowStep, state: RoomState, party: PartyContext) {
  if (!("gameId" in step) || !isGameId(step.gameId)) return false;
  return getGameAvailability(getGame(step.gameId), party, state).status !== "blocked";
}

function interludePrewarmGames(
  steps: readonly RunOfShowStep[],
  activeInterludeId: string | undefined,
  state: RoomState,
  party: PartyContext,
) {
  if (!activeInterludeId) return [];
  const interludeIndex = steps.findIndex((step) => step.id === activeInterludeId);
  if (interludeIndex < 0) return [];
  const gameIds: AiPrewarmGameId[] = [];

  for (const step of steps.slice(interludeIndex + 1)) {
    if (step.actId !== party.actId || !("gameId" in step)) break;
    if (
      isGameId(step.gameId) &&
      isAiPrewarmGameId(step.gameId) &&
      isPlayableStep(step, state, party) &&
      !gameIds.includes(step.gameId)
    ) {
      gameIds.push(step.gameId);
    }
    if (step.kind === "foreground-game") break;
    if (step.kind !== "background-start") break;
  }

  return gameIds;
}

function availabilityLabel(availability: GameAvailability, locale: "en" | "ru") {
  if (availability.status === "recommended") return locale === "ru" ? "В тему" : "Best fit";
  if (availability.status === "available") return locale === "ru" ? "Доступно" : "Available";
  return availability.reason ?? (locale === "ru" ? "Пока недоступно" : "Not ready");
}

function actChangeMessage(label: string, locale: "en" | "ru") {
  return locale === "ru"
    ? `Перейти к «${label}»? Сцена, подсказки и рекомендации ведущего изменятся.`
    : `Move to “${label}”? The scene, host cues and recommendations will change.`;
}

export function HostConductor({
  roomId,
  state,
  onLaunchGame,
  onSelectExperience,
  onSelectAct,
  onFinishParty,
  onPrepareAi,
  onBeginRouteStep,
  onCompleteRouteStep,
}: HostConductorProps) {
  const venue = state.venue ?? "park";
  const party =
    state.party ?? contextForExperience("classic-park", venue === "bar" ? "bar-only" : "normal");
  const locale = party.uiLocale;
  const isScripted = party.experienceId !== "classic-park";
  const route = getExperienceRoute(party.experienceId, party.contingency);
  const act = getExperienceAct(party.experienceId, party.actId);
  const labels = getConductorLabels(party);
  const runProgress =
    state.runOfShow?.experienceId === party.experienceId &&
    state.runOfShow.contingency === party.contingency
      ? state.runOfShow
      : undefined;
  const completedStepIds = runProgress?.completedStepIds ?? [];
  const actTimeline = buildActTimeline(party);
  const routeTimeline = buildRouteTimeline(party, completedStepIds);
  const nextRouteStep = getNextIncompleteRouteStep(party, completedStepIds);
  const activeInterlude =
    nextRouteStep?.kind === "interlude" && runProgress?.activeStepId === nextRouteStep.id
      ? nextRouteStep
      : undefined;
  const storyEvidence = latestPartyEvidence(state);
  const storyGame =
    storyEvidence && isGameId(storyEvidence.gameId) ? getGame(storyEvidence.gameId) : undefined;
  const storyTitle = storyEvidence
    ? (storyGame?.localizedTitle[locale] ?? storyEvidence.title)
    : undefined;
  const hasStorySource = Boolean(storyEvidence || party.storySeed);
  const nextActId = getNextExperienceAct(party);
  const nextAct = nextActId ? getExperienceAct(party.experienceId, nextActId) : undefined;
  const library = getRecommendedGames(state, party);
  const baseActionableStep = getNextActionableRouteStep(
    party,
    (step) =>
      !completedStepIds.includes(step.id) &&
      isPlayableStep(step, state, party) &&
      !(
        "gameId" in step &&
        ((step.gameId === "contraband" && Boolean(state.contraband)) ||
          (step.gameId === "tongsoftruth" &&
            Boolean(state.tongsoftruth) &&
            (party.contingency !== "compact" || state.tongsoftruth?.status === "results")) ||
          (step.gameId === "toastsyndicate" && state.toastsyndicate?.phase === "results") ||
          (step.gameId === "crossexamination" && Boolean(state.crossexamination)) ||
          (step.gameId === "smokescreen" &&
            ((step.stage === "assign" && Boolean(state.smokescreen)) ||
              (step.stage === "reveal" && state.smokescreen?.status === "results"))) ||
          (step.gameId === "grilloracle" &&
            (((step.stage === "capture" || step.stage === "bar-capture") &&
              Boolean(state.oracleMemory)) ||
              (step.stage === "verify" && state.oracleMemory?.status === "verified"))) ||
          (step.gameId === "sommelier" &&
            (state.sommelier?.phase === "results" || Boolean(state.contraband))))
      ),
  );
  const contrabandAfterSommelier =
    state.sommelier?.phase === "results" && !state.contraband
      ? route.steps.find(
          (step) =>
            step.actId === party.actId &&
            "gameId" in step &&
            step.gameId === "contraband" &&
            isPlayableStep(step, state, party),
        )
      : undefined;
  const actionableStep = contrabandAfterSommelier ?? baseActionableStep;
  const isOracleVerificationStep = Boolean(
    actionableStep &&
    "gameId" in actionableStep &&
    actionableStep.gameId === "grilloracle" &&
    actionableStep.stage === "verify" &&
    state.oracleMemory,
  );
  const isSmokeScreenLifecycleStep = Boolean(
    actionableStep &&
    "gameId" in actionableStep &&
    actionableStep.gameId === "smokescreen" &&
    state.smokescreen,
  );
  const isTongsLifecycleStep = Boolean(
    actionableStep &&
    "gameId" in actionableStep &&
    actionableStep.gameId === "tongsoftruth" &&
    state.tongsoftruth,
  );
  const routeGame =
    !isOracleVerificationStep &&
    !isSmokeScreenLifecycleStep &&
    !isTongsLifecycleStep &&
    actionableStep &&
    "gameId" in actionableStep &&
    isGameId(actionableStep.gameId)
      ? getGame(actionableStep.gameId)
      : undefined;
  const primary =
    isOracleVerificationStep || isSmokeScreenLifecycleStep || isTongsLifecycleStep
      ? undefined
      : routeGame
        ? {
            game: routeGame,
            availability: getGameAvailability(routeGame, party, state),
            routeStep: actionableStep,
          }
        : (library.find((entry) => entry.availability.status !== "blocked") ?? library[0]);
  const hasScores = state.teams.some((team) => team.score !== 0);
  const primaryPrewarmGameId =
    primary && isAiPrewarmGameId(primary.game.id) ? primary.game.id : undefined;
  const primaryPrewarmCacheKey = primaryPrewarmGameId
    ? aiPrewarmCacheKey(state, primaryPrewarmGameId, party.actId)
    : undefined;
  const primaryPreparedMeta = primaryPrewarmGameId
    ? state.aiRuntime?.prepared?.[primaryPrewarmGameId]
    : undefined;
  const primaryPrepared =
    primaryPreparedMeta?.cacheKey === primaryPrewarmCacheKey ? primaryPreparedMeta : undefined;
  const interludePrewarmGameIds = interludePrewarmGames(
    route.steps,
    activeInterlude?.id,
    state,
    party,
  );
  const postStepPrimaryPrewarmGameId =
    !activeInterlude &&
    isScripted &&
    completedStepIds.length > 0 &&
    actionableStep &&
    primaryPrewarmGameId
      ? primaryPrewarmGameId
      : undefined;
  const automaticPrewarmGameIds = activeInterlude
    ? interludePrewarmGameIds
    : postStepPrimaryPrewarmGameId
      ? [postStepPrimaryPrewarmGameId]
      : [];
  const automaticPrewarmTriggerId =
    activeInterlude?.id ?? (postStepPrimaryPrewarmGameId ? actionableStep?.id : undefined);
  const automaticPrewarmTargets = automaticPrewarmGameIds.map((gameId) => {
    const cacheKey = aiPrewarmCacheKey(state, gameId, party.actId);
    const preparedCacheKey = state.aiRuntime?.prepared?.[gameId]?.cacheKey;
    return {
      gameId,
      targetActId: party.actId,
      cacheKey,
      attemptKey: autoAiPrewarmAttemptKey({
        triggerId: automaticPrewarmTriggerId,
        gameId,
        cacheKey,
        preparedCacheKey,
      }),
    };
  });
  const [now, setNow] = useState(() => Date.now());
  const [preparingGameId, setPreparingGameId] = useState<AiPrewarmGameId | null>(null);
  const [prewarmError, setPrewarmError] = useState<string | null>(null);
  const automaticPrewarmAttempts = useRef(new Set<string>());
  const nextAutomaticPrewarmTarget = automaticPrewarmTargets.find(
    (target) => target.attemptKey && !automaticPrewarmAttempts.current.has(target.attemptKey),
  );
  const nextAutomaticPrewarmAttemptKey = nextAutomaticPrewarmTarget?.attemptKey;
  const nextAutomaticPrewarmGameId = nextAutomaticPrewarmTarget?.gameId;
  const nextAutomaticPrewarmActId = nextAutomaticPrewarmTarget?.targetActId;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !nextAutomaticPrewarmAttemptKey ||
      !nextAutomaticPrewarmGameId ||
      !nextAutomaticPrewarmActId ||
      preparingGameId ||
      automaticPrewarmAttempts.current.has(nextAutomaticPrewarmAttemptKey)
    ) {
      return;
    }

    automaticPrewarmAttempts.current.add(nextAutomaticPrewarmAttemptKey);
    setPrewarmError(null);
    setPreparingGameId(nextAutomaticPrewarmGameId);
    void onPrepareAi(nextAutomaticPrewarmGameId, nextAutomaticPrewarmActId)
      .catch((error) => {
        setPrewarmError(friendlyHostActionError(error, "AI game", "prepare"));
      })
      .finally(() => setPreparingGameId(null));
  }, [
    nextAutomaticPrewarmActId,
    nextAutomaticPrewarmAttemptKey,
    nextAutomaticPrewarmGameId,
    onPrepareAi,
    preparingGameId,
  ]);

  function requestActChange(targetActId: PartyActId, explicit = false) {
    if (targetActId === party.actId) return;
    const target = getExperienceAct(party.experienceId, targetActId);
    if (!target) return;
    const currentIndex = route.actOrder.indexOf(party.actId);
    const targetIndex = route.actOrder.indexOf(targetActId);
    if (
      !explicit &&
      targetIndex > currentIndex &&
      !window.confirm(actChangeMessage(target.label[locale], locale))
    ) {
      return;
    }
    onSelectAct(targetActId);
  }

  async function prepareAi(gameId: AiPrewarmGameId) {
    setPrewarmError(null);
    setPreparingGameId(gameId);
    try {
      await onPrepareAi(gameId, party.actId);
    } catch (error) {
      setPrewarmError(friendlyHostActionError(error, "AI game", "prepare"));
    } finally {
      setPreparingGameId(null);
    }
  }

  const themeClass = THEME_CLASSES[act?.themeKey ?? "classic"];
  const showOracleLifecycle = Boolean(
    state.oracleMemory && ["transition", "bar", "finale"].includes(party.actId),
  );
  const oracleNeedsSeal = Boolean(
    state.oracleMemory &&
    (state.oracleMemory.status === "collecting" || state.oracleMemory.status === "ready"),
  );

  return (
    <section
      data-testid="party-conductor"
      data-experience-id={party.experienceId}
      data-act-id={party.actId}
      data-next-route-step-id={nextRouteStep?.id ?? ""}
      data-active-route-step-id={runProgress?.activeStepId ?? ""}
      data-completed-route-steps={completedStepIds.length}
      data-total-route-steps={route.steps.length}
      data-next-route-step-kind={nextRouteStep?.kind ?? ""}
      data-next-act-id={nextAct?.id ?? ""}
      data-story-evidence-count={state.finale?.evidence.length ?? 0}
      data-auto-prewarm-game-id={automaticPrewarmTargets[0]?.gameId ?? ""}
      data-auto-prewarm-game-ids={automaticPrewarmTargets.map((target) => target.gameId).join(",")}
      className={`agh-conductor ${themeClass}`}
    >
      <div className="agh-conductor-main">
        <div className="agh-conductor-head">
          <div>
            <div className="agh-conductor-kicker">Party conductor</div>
            <h2>{labels.experienceTitle}</h2>
            <div className="agh-conductor-meta">
              <span>{labels.actLabel}</span>
              <span>{labels.contingencyLabel}</span>
              <span>
                {locale === "ru" ? "В акте" : "Act elapsed"} ·{" "}
                {formatActElapsed(party.actStartedAt, now)}
              </span>
              {isScripted && (
                <span>
                  {locale === "ru" ? "Маршрут" : "Route"} · {getRouteDurationMinutes(party)} min
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onFinishParty}
            data-testid="party-finale-trigger"
            data-has-scores={hasScores ? "true" : "false"}
            className="agh-conductor-finale"
          >
            {locale === "ru" ? "Финал" : "Party finale"} <b aria-hidden>↗</b>
          </button>
        </div>

        <div className="agh-conductor-experiences">
          {EXPERIENCE_IDS.map((experienceId) => {
            const optionPack = getExperiencePack(experienceId);
            return (
              <button
                key={experienceId}
                type="button"
                onClick={() =>
                  onSelectExperience(
                    experienceId,
                    experienceId === party.experienceId
                      ? party.contingency
                      : experienceId === "classic-park" || party.contingency === "bar-only"
                        ? "normal"
                        : party.contingency,
                  )
                }
                className={party.experienceId === experienceId ? "is-active" : ""}
              >
                {optionPack.shortTitle[locale]}
              </button>
            );
          })}
        </div>

        <div className="agh-conductor-formats">
          {(party.experienceId === "classic-park"
            ? ([
                { id: "normal", en: "Park", ru: "Парк" },
                { id: "bar-only", en: "Bar", ru: "Бар" },
              ] as const)
            : party.experienceId === "smoke-neon-norrebro"
              ? ([
                  { id: "compact", en: "Compact", ru: "Компакт" },
                  { id: "normal", en: "Full evening", ru: "Полный вечер" },
                  { id: "extended", en: "Extended · 4h", ru: "Расширенный · 4ч" },
                  { id: "bar-only", en: "Bar only", ru: "Только бар" },
                ] as const)
              : ([
                  { id: "compact", en: "2 hours", ru: "2 часа" },
                  { id: "normal", en: "3 hours", ru: "3 часа" },
                  { id: "extended", en: "4 hours", ru: "4 часа" },
                ] as const)
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectExperience(party.experienceId, option.id)}
              className={party.contingency === option.id ? "is-active" : ""}
            >
              {option[locale]}
            </button>
          ))}
        </div>

        {actTimeline.length > 1 && (
          <div className="agh-conductor-acts">
            {actTimeline.map(({ act: timelineAct, status, durationMinutes }, index) => (
              <button
                key={timelineAct.id}
                type="button"
                onClick={() => requestActChange(timelineAct.id)}
                className={`is-${status}`}
              >
                <span>
                  {status === "past" ? "✓" : status === "current" ? "Now" : `0${index + 1}`}
                </span>
                <strong>{timelineAct.label[locale]}</strong>
                <small>~{durationMinutes} min</small>
              </button>
            ))}
          </div>
        )}

        <p className="agh-conductor-environment">
          {act?.environmentContext[locale] ??
            (locale === "ru"
              ? "Выбери акт и запусти игру ниже."
              : "Choose an act, then launch a game below.")}
        </p>

        {showOracleLifecycle && <GrillOracleLifecycleHost roomId={roomId} state={state} />}
        <div className="agh-conductor-cue">
          <div className="agh-conductor-cue-label">
            {locale === "ru" ? "Следующее рекомендованное" : "Next recommended"}
          </div>

          {party.actId === "transition" && nextAct ? (
            <>
              <div className="agh-conductor-cue-title">{nextAct.label[locale]}</div>
              <p className="agh-conductor-cue-copy">
                {oracleNeedsSeal
                  ? locale === "ru"
                    ? "Сначала опечатай готовые пророчества в карточке выше."
                    : "Seal the completed prophecies in the card above first."
                  : locale === "ru"
                    ? "Улики опечатаны. Перенеси людей, реквизит и историю в следующую локацию."
                    : "Evidence sealed. Move the people, props and story into the next location."}
              </p>
              {nextRouteStep && hasStorySource && (
                <RouteStoryCallback
                  step={nextRouteStep}
                  evidence={storyEvidence}
                  storySeed={party.storySeed}
                  storyTitle={storyTitle}
                  locale={locale}
                />
              )}
              <button
                type="button"
                onClick={() => requestActChange(nextAct.id, true)}
                disabled={oracleNeedsSeal}
                data-testid="route-next-act"
                data-act-id={nextAct.id}
                className="agh-conductor-primary-action"
              >
                <span>{locale === "ru" ? "Открыть следующий акт" : "Open the next act"}</span>
                <b aria-hidden>↗</b>
              </button>
            </>
          ) : party.actId === "finale" ? (
            <>
              <div className="agh-conductor-cue-title">
                {locale === "ru" ? "Вынести вердикт" : "Deliver the verdict"}
              </div>
              <p className="agh-conductor-cue-copy">
                {hasScores
                  ? locale === "ru"
                    ? "Счёт готов. Собери всех, убери телефоны и покажи пьедестал."
                    : "The score is ready. Gather everyone, put the phones down and show the podium."
                  : locale === "ru"
                    ? "Очков нет — зато у вечера всё равно есть история. Собери всех и закрой дело."
                    : "No points yet, but the evening still has a story. Gather everyone and close the case."}
              </p>
              {nextRouteStep && hasStorySource && (
                <RouteStoryCallback
                  step={nextRouteStep}
                  evidence={storyEvidence}
                  storySeed={party.storySeed}
                  storyTitle={storyTitle}
                  locale={locale}
                />
              )}
              <button
                type="button"
                onClick={onFinishParty}
                data-testid="route-finale-trigger"
                data-has-scores={hasScores ? "true" : "false"}
                className="agh-conductor-primary-action"
              >
                <span>{locale === "ru" ? "Показать финал" : "Show the finale"}</span>
                <b aria-hidden>↗</b>
              </button>
            </>
          ) : nextRouteStep?.kind === "interlude" ? (
            <>
              <div className="agh-conductor-cue-title">
                {getRunStepLabel(nextRouteStep, locale)}
              </div>
              <p className="agh-conductor-cue-copy">{getRunStepCue(nextRouteStep, locale)}</p>
              {hasStorySource && (
                <RouteStoryCallback
                  step={nextRouteStep}
                  evidence={storyEvidence}
                  storySeed={party.storySeed}
                  storyTitle={storyTitle}
                  locale={locale}
                />
              )}
              <div className="agh-conductor-cue-timing">
                {nextRouteStep.durationMinutes} {locale === "ru" ? "минут" : "minutes"} ·{" "}
                {activeInterlude
                  ? locale === "ru"
                    ? `в эфире ${formatActElapsed(runProgress?.activeStepStartedAt, now)}`
                    : `live for ${formatActElapsed(runProgress?.activeStepStartedAt, now)}`
                  : locale === "ru"
                    ? "таймер ещё не запущен"
                    : "timer has not started"}
              </div>
              {activeInterlude ? (
                <button
                  type="button"
                  onClick={() => onCompleteRouteStep(nextRouteStep.id)}
                  data-testid="route-complete-interlude"
                  data-step-id={nextRouteStep.id}
                  className="agh-conductor-primary-action"
                >
                  <span>{locale === "ru" ? "Момент завершён" : "Moment complete"}</span>
                  <b aria-hidden>↗</b>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onBeginRouteStep(nextRouteStep.id)}
                  data-testid="route-begin-interlude"
                  data-step-id={nextRouteStep.id}
                  className="agh-conductor-primary-action"
                >
                  <span>{locale === "ru" ? "Начать этот момент" : "Begin this moment"}</span>
                  <b aria-hidden>↗</b>
                </button>
              )}
            </>
          ) : isOracleVerificationStep ? (
            <p className="agh-conductor-cue-copy">
              {locale === "ru"
                ? "Вскрой печать и зафиксируй три исхода для каждого игрока в карточке Оракула выше."
                : "Break the seal and lock all three outcomes for each player in the Oracle card above."}
            </p>
          ) : isSmokeScreenLifecycleStep ? (
            <p className="agh-conductor-cue-copy">
              {locale === "ru"
                ? "«Дымовая Завеса» уже идёт фоном. Раздай, закрой или вскрой миссии в карточке выше — foreground-игры продолжат работать независимо."
                : "Smoke Screen is already running in the background. Deal, seal or reveal it in the card above; foreground games remain independent."}
            </p>
          ) : isTongsLifecycleStep ? (
            <p className="agh-conductor-cue-copy">
              {locale === "ru"
                ? "Компактный блиц уже идёт в карточке выше. Проведи все пять level-3 показаний, затем маршрут откроет Оракула."
                : "The compact blitz is live in the card above. Finish all five level-3 testimonies, then the route will open the Oracle."}
            </p>
          ) : primary ? (
            <PrimaryGameRecommendation
              game={primary.game}
              availability={primary.availability}
              routeStep={"routeStep" in primary ? primary.routeStep : undefined}
              locale={locale}
              onLaunch={() => onLaunchGame(primary.game.id)}
              prepared={primaryPrepared}
              preparing={preparingGameId === primaryPrewarmGameId}
              onPrepare={primaryPrewarmGameId ? () => prepareAi(primaryPrewarmGameId) : undefined}
              storyEvidence={storyEvidence}
              storySeed={party.storySeed}
              storyTitle={storyTitle}
            />
          ) : (
            <p className="agh-conductor-cue-copy">
              {locale === "ru"
                ? "Для этого акта пока нет подходящей игры."
                : "No fitting game yet."}
            </p>
          )}
          {prewarmError && <p className="agh-conductor-error">{prewarmError}</p>}

          {nextAct && party.actId !== "transition" && (
            <button
              type="button"
              onClick={() => requestActChange(nextAct.id)}
              data-testid="route-next-act"
              data-act-id={nextAct.id}
              className="agh-conductor-next-act"
            >
              {locale === "ru" ? "Перейти дальше" : "Move on"}: {nextAct.label[locale]} ↗
            </button>
          )}
        </div>

        {isScripted &&
          nextRouteStep &&
          nextRouteStep.kind !== "interlude" &&
          nextRouteStep.id !== actionableStep?.id && (
            <div className="agh-conductor-route-story">
              <div>{locale === "ru" ? "Сюжетная реплика маршрута" : "Route story cue"}</div>
              <strong>{getRunStepLabel(nextRouteStep, locale)}</strong>
              <p>{getRunStepCue(nextRouteStep, locale)}</p>
            </div>
          )}

        {routeTimeline.length > 0 && (
          <details className="agh-conductor-timeline">
            <summary>
              {locale === "ru" ? "Таймлайн вечера" : "Run of show"} · {routeTimeline.length}{" "}
              {locale === "ru" ? "моментов" : "moments"}
            </summary>
            <ol>
              {routeTimeline.map(({ step, status }) => {
                const implemented = !("gameId" in step) || isGameId(step.gameId);
                return (
                  <li key={step.id} className={`is-${status}`}>
                    <span>
                      {status === "past" ? "✓" : status === "current" ? "→" : "·"}{" "}
                      {getRunStepLabel(step, locale)}
                    </span>
                    <span>
                      {step.durationMinutes}m · {implemented ? "live" : "planned"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </details>
        )}
      </div>

      <div className="agh-conductor-library">
        <div className="agh-conductor-library-head">
          <div>
            <div>{locale === "ru" ? "Дополнительные игры" : "Optional game library"}</div>
            <p>
              {locale === "ru"
                ? "Не в тему — не значит запрещено. Серые карточки всё равно запускаются."
                : "Off-theme is still playable. Only objectively blocked games are disabled."}
            </p>
          </div>
        </div>
        <div className="agh-conductor-library-grid">
          {library.map(({ game, availability }) => (
            <ConductorGameCard
              key={game.id}
              game={game}
              availability={availability}
              locale={locale}
              onLaunch={() => onLaunchGame(game.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RouteStoryCallback({
  step,
  evidence,
  storySeed,
  storyTitle,
  locale,
}: {
  step: RunOfShowStep;
  evidence?: PartyStoryEvidenceItem;
  storySeed?: string;
  storyTitle?: string;
  locale: "en" | "ru";
}) {
  const evidenceBridge = evidence ? getRunStepStoryBridge(step, locale, evidence) : undefined;
  const seedBridge = storySeed ? getRunStepStoryOpening(step, locale, storySeed) : undefined;
  const bridge = evidenceBridge ?? seedBridge;
  if (!bridge) return null;
  const source = evidenceBridge ? "evidence" : "seed";

  return (
    <div
      data-testid="route-story-callback"
      data-story-source={source}
      data-evidence-id={evidence?.id}
      data-target-step-id={step.id}
      className="agh-conductor-story"
    >
      <div>
        {source === "evidence" && evidence
          ? `${locale === "ru" ? "Готовая связка ведущего" : "Host-ready story bridge"} · ${storyTitle ?? evidence.title}`
          : locale === "ru"
            ? "Стартовая реплика ведущего · Нить вечера"
            : "Host opening line · Tonight's thread"}
      </div>
      <strong>{bridge}</strong>
    </div>
  );
}

function PrimaryGameRecommendation({
  game,
  availability,
  routeStep,
  locale,
  onLaunch,
  prepared,
  preparing,
  onPrepare,
  storyEvidence,
  storySeed,
  storyTitle,
}: {
  game: GameDefinition;
  availability: GameAvailability;
  routeStep?: RunOfShowStep;
  locale: "en" | "ru";
  onLaunch: () => void;
  prepared?: AiPreparedMeta;
  preparing?: boolean;
  onPrepare?: () => void;
  storyEvidence?: PartyStoryEvidenceItem;
  storySeed?: string;
  storyTitle?: string;
}) {
  const blocked = availability.status === "blocked";
  return (
    <>
      <div className="agh-conductor-primary-game" data-game-id={game.id}>
        <div>
          <div>{game.localizedTitle[locale]}</div>
          <small>
            {routeStep ? `${getRunStepLabel(routeStep, locale)} · ` : ""}
            {game.durationLabel[locale]} · {availabilityLabel(availability, locale)}
          </small>
        </div>
      </div>
      <p className="agh-conductor-cue-copy">{game.description[locale]}</p>
      {routeStep && (storyEvidence || storySeed) && (
        <RouteStoryCallback
          step={routeStep}
          evidence={storyEvidence}
          storySeed={storySeed}
          storyTitle={storyTitle}
          locale={locale}
        />
      )}
      <button
        type="button"
        onClick={onLaunch}
        disabled={blocked}
        data-testid="route-launch-game"
        data-game-id={game.id}
        data-route-step-id={routeStep?.id ?? ""}
        data-game-format={game.format}
        className="agh-conductor-primary-action"
      >
        <span>
          {blocked
            ? availability.reason
            : `${locale === "ru" ? "Запустить" : "Start"} ${game.localizedTitle[locale]}`}
        </span>
        {!blocked && <b aria-hidden>↗</b>}
      </button>
      {onPrepare && !blocked && (
        <button
          type="button"
          onClick={onPrepare}
          disabled={preparing || Boolean(prepared)}
          className="agh-conductor-prepare"
        >
          {prepared
            ? `${prepared.usedFallback ? "Fallback deck" : "AI"} ready · ${new Date(prepared.preparedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : preparing
              ? locale === "ru"
                ? "Готовлю…"
                : "Preparing…"
              : locale === "ru"
                ? "Подготовить AI заранее"
                : "Prepare AI now"}
        </button>
      )}
    </>
  );
}

function ConductorGameCard({
  game,
  availability,
  locale,
  onLaunch,
}: {
  game: GameDefinition;
  availability: GameAvailability;
  locale: "en" | "ru";
  onLaunch: () => void;
}) {
  const blocked = availability.status === "blocked";
  return (
    <div
      className={`agh-conductor-game ${
        blocked
          ? "is-blocked"
          : availability.status === "available"
            ? "is-available"
            : "is-recommended"
      }`}
      data-game-id={game.id}
    >
      <button
        type="button"
        onClick={onLaunch}
        disabled={blocked}
        className="agh-conductor-game-action"
      >
        <span>{availabilityLabel(availability, locale)}</span>
        <strong>{game.localizedTitle[locale]}</strong>
        <small>{game.durationLabel[locale]}</small>
        <p>{game.description[locale]}</p>
      </button>
      <div className="agh-conductor-game-rules">
        <GameRulesDialogTrigger gameId={game.id} />
      </div>
    </div>
  );
}
