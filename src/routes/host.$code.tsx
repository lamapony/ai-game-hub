import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  useRoom,
  useBroadcast,
  sendHostCommandSnapshot,
  getHostSecret,
  genId,
  storeHostSecret,
} from "@/lib/room";
import { supabase } from "@/integrations/supabase/client";
import { eventProfile } from "@/lib/event-profile";
import { activeGame, activeGamePhase } from "@/games/registry";
import { teamColorClasses } from "@/lib/team-style";
import {
  buildWinnerAnnouncement,
  canSkipCurrentPhase,
  computeTeamStandings,
  formatRussianPlace,
  formatRussianPoints,
  getWinningStandings,
} from "@/lib/host-controls";
import {
  contextForExperience,
  getExperienceAct,
  getExperiencePack,
  getExperienceRoute,
  type RunOfShowStep,
} from "@/experiences/catalog";
import {
  buildRouteTimeline,
  getConductorLabels,
  getNextIncompleteRouteStep,
  getNextRecommendedRouteStep,
  getRunStepCue,
  getRunStepLabel,
} from "@/experiences/conductor";
import {
  EXPERIENCE_IDS,
  type ContingencyPlan,
  type ExperienceId,
  type PartyActId,
} from "@/lib/party-context";
import { speakerReadiness } from "@/lib/speaker-status";
import { friendlyHostActionError, HOST_ACTION_ERROR_EVENT } from "@/lib/host-action-errors";
import { MAX_TEAMS, playersOnTeam, suggestTeamName } from "@/lib/teams";
import type { GameId, RoomState } from "@/lib/types";
import type { RoomConnectionStatus } from "@/lib/room";
import type { HostCommand } from "@/lib/host-command";
import { HostConductor } from "@/components/host-conductor";
import { QuickStartBriefCard } from "@/components/quick-start-brief-card";
import { QuickStartLaunchSignal } from "@/components/quick-start-launch-signal";
import { GameRulesDialogTrigger } from "@/components/game-rules-ui";
import { publicJoinUrl, publicSpeakerUrl } from "@/lib/public-site";
import { ActiveHostGameView } from "@/games/host-view-registry";
import { GAME_IDS } from "@/games/ids";
import { sealOracleRunClient } from "@/lib/oracle-lifecycle-client";
import { sealSmokeScreenClient } from "@/lib/smokescreen-client";
import { SmokeScreenBackgroundHost } from "@/games/smokescreen/BackgroundHost";
import { ContrabandBackgroundHost } from "@/games/contraband/BackgroundHost";
import { TongsOfTruthBackgroundHost } from "@/games/tongsoftruth/BackgroundHost";
import { PartyFinaleLedger } from "@/components/party-finale-ledger";
import { PartyFinaleNarrative } from "@/components/party-finale-narrative";
import { TapeReel } from "@/components/tape-reel";
import { FieldReportPanel } from "@/components/field-report-panel";
import { normalizeAiRuntimeState } from "@/lib/ai-budget";
import { prewarmAiGameClient } from "@/lib/ai-prewarm-client";
import type { AiPrewarmGameId } from "@/lib/ai-prewarm";
import { speechUrl } from "@/lib/speech-client";
import { getQuickStartReadiness, QUICK_START_PROFILES } from "@/lib/quick-start";
import {
  buildQuickStartLaunchCoach,
  getCurrentQuickStartLaunchSignal,
  type QuickStartLaunchCoach,
} from "@/lib/quick-start-launch-coach";
import { playerDeviceCheckStatus, summarizePlayerDeviceChecks } from "@/lib/device-readiness";
import { canRemovePlayerBeforeParty } from "@/lib/room-capacity";
import { getHostReleaseHealth } from "@/lib/release-health-client";
import type { ReleaseHealthReport } from "@/lib/release-health";
import {
  buildHostAccessUrl,
  HOST_ACCESS_HASH_KEY,
  hostSecretFromAccessHash,
  verifyHostAccessClient,
} from "@/lib/host-access";
import { RoomLoadRecovery } from "@/components/room-load-recovery";

type ReleaseHealthLoadState =
  | { status: "checking" }
  | { status: "ready" | "degraded"; report: ReleaseHealthReport }
  | { status: "error"; message: string };

export const Route = createFileRoute("/host/$code")({
  component: HostPage,
});

function HostPage() {
  const { code } = Route.useParams();
  const { room, loading, error, connectionStatus, lastSyncedAt, refreshRoom, setRoom } =
    useRoom(code);
  const [isHost, setIsHost] = useState(false);
  const [checkingHostAccess, setCheckingHostAccess] = useState(true);
  const [hostAccessError, setHostAccessError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hadAccessHash = hashParams.has(HOST_ACCESS_HASH_KEY);
    const candidate = hostSecretFromAccessHash(window.location.hash);
    if (hadAccessHash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    if (getHostSecret(code)) {
      setIsHost(true);
      setHostAccessError(null);
      setCheckingHostAccess(false);
      return () => {
        cancelled = true;
      };
    }
    if (!candidate) {
      setIsHost(false);
      setHostAccessError(
        hadAccessHash ? "This backup host link is malformed. Ask the host for a new one." : null,
      );
      setCheckingHostAccess(false);
      return () => {
        cancelled = true;
      };
    }
    setCheckingHostAccess(true);
    void verifyHostAccessClient({ code, hostSecret: candidate })
      .then((access) => {
        if (cancelled) return;
        storeHostSecret(access.code, access.roomId, candidate);
        setIsHost(true);
        setHostAccessError(null);
      })
      .catch((accessError) => {
        if (cancelled) return;
        setIsHost(false);
        setHostAccessError(
          accessError instanceof Error
            ? accessError.message
            : "Backup host access could not be verified.",
        );
      })
      .finally(() => {
        if (!cancelled) setCheckingHostAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) return <Center>Loading room…</Center>;
  if (!room)
    return (
      <Center>
        <RoomLoadRecovery code={code} error={error} onRetry={refreshRoom} />
      </Center>
    );
  if (checkingHostAccess) return <Center>Checking private host access…</Center>;
  if (!isHost)
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="text-white/70">You opened this room as a guest.</div>
          <p className="mt-2 text-sm text-white/50">
            {hostAccessError ??
              "If you are the host, open the private backup link copied from Live safety."}
          </p>
          <Link
            to="/play/$code"
            params={{ code }}
            className="inline-block mt-5 rounded-2xl bg-[var(--color-park-bright)] px-5 py-3 text-[oklch(0.18_0.05_160)] font-medium"
          >
            Join as player →
          </Link>
        </div>
      </Center>
    );

  return (
    <HostInner
      roomId={room.id}
      code={room.code}
      state={room.state}
      connectionStatus={connectionStatus}
      lastSyncedAt={lastSyncedAt}
      onResync={async () => {
        await refreshRoom();
      }}
      onCommandState={(snapshot) => {
        setRoom((current) =>
          current
            ? {
                ...current,
                state: snapshot.state,
                updatedAt: snapshot.updatedAt ?? current.updatedAt,
              }
            : current,
        );
      }}
    />
  );
}

function HostInner({
  roomId,
  code,
  state,
  connectionStatus,
  lastSyncedAt,
  onResync,
  onCommandState,
}: {
  roomId: string;
  code: string;
  state: RoomState;
  connectionStatus: RoomConnectionStatus;
  lastSyncedAt: number | null;
  onResync: () => Promise<void>;
  onCommandState: (snapshot: { state: RoomState; updatedAt?: string }) => void;
}) {
  const { send } = useBroadcast(roomId);
  const [hostActionError, setHostActionError] = useState<string | null>(null);
  const [releaseHealth, setReleaseHealth] = useState<ReleaseHealthLoadState>({
    status: "checking",
  });
  const releaseHealthRequest = useRef(0);

  const totalPlayers = state.players.length;
  const joinUrl = publicJoinUrl(code);
  const speakerUrlFor = (slot: number) => publicSpeakerUrl(code, slot);
  const hostProgramLabel = state.quickStart
    ? QUICK_START_PROFILES[state.quickStart.venue].title
    : eventProfile.title;

  const refreshReleaseHealth = useCallback(async () => {
    const requestId = ++releaseHealthRequest.current;
    setReleaseHealth({ status: "checking" });
    try {
      const report = await getHostReleaseHealth(roomId);
      if (releaseHealthRequest.current !== requestId) return;
      setReleaseHealth({ status: report.status, report });
    } catch (error) {
      if (releaseHealthRequest.current !== requestId) return;
      setReleaseHealth({
        status: "error",
        message: friendlyHostActionError(error, "live safety check", "complete"),
      });
    }
  }, [roomId]);

  useEffect(() => {
    void refreshReleaseHealth();
    return () => {
      releaseHealthRequest.current += 1;
    };
  }, [refreshReleaseHealth]);

  useEffect(() => {
    const handleHostActionError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: unknown }>).detail;
      setHostActionError(
        typeof detail?.message === "string" && detail.message
          ? detail.message
          : "Could not save host action. Try again.",
      );
    };
    window.addEventListener(HOST_ACTION_ERROR_EVENT, handleHostActionError);
    return () => window.removeEventListener(HOST_ACTION_ERROR_EVENT, handleHostActionError);
  }, []);

  function runHostAction(action: () => Promise<void>) {
    setHostActionError(null);
    return action().catch((error) => {
      setHostActionError(friendlyHostActionError(error, "host action", "complete"));
    });
  }

  async function commitHostCommand(command: HostCommand) {
    const snapshot = await sendHostCommandSnapshot(roomId, command);
    onCommandState(snapshot);
  }

  function testSpeaker(slot: number) {
    if (slot === 1) {
      // host laptop = slot 1: play locally
      const a = new Audio(speechUrl("Main speaker online.", roomId));
      a.play().catch(() => {});
    } else {
      send({ type: "test-tone", slot });
    }
  }

  async function launchGame(gameId: GameId) {
    await commitHostCommand({ type: "launch-game", gameId });
  }

  async function selectExperience(experienceId: ExperienceId, contingency: ContingencyPlan) {
    if (state.party?.experienceId === experienceId && state.party.contingency === contingency)
      return;
    await commitHostCommand({ type: "select-experience", experienceId, contingency });
  }

  async function selectAct(actId: PartyActId) {
    if (state.party?.actId === actId) return;
    const memory = state.oracleMemory;
    if (
      memory &&
      actId !== "grill" &&
      (memory.status === "collecting" || memory.status === "ready")
    ) {
      const missingCount = Math.max(
        0,
        memory.participantIds.length - memory.submittedPlayerIds.length,
      );
      if (
        missingCount > 0 &&
        !window.confirm(
          `${missingCount} Oracle prophecies are missing. Seal the completed records and continue?`,
        )
      ) {
        return;
      }
      await sealOracleRunClient({
        roomId,
        runId: memory.runId,
        allowIncomplete: missingCount > 0,
      });
    }
    const smoke = state.smokescreen;
    if (smoke && actId !== "grill" && (smoke.status === "assigning" || smoke.status === "active")) {
      const missingCount = Math.max(
        0,
        smoke.participantIds.length - smoke.assignedPlayerIds.length,
      );
      if (
        missingCount > 0 &&
        !window.confirm(
          `${missingCount} Smoke Screen missions are missing. Seal the completed deal and continue?`,
        )
      ) {
        return;
      }
      await sealSmokeScreenClient({
        roomId,
        runId: smoke.runId,
        allowIncomplete: missingCount > 0,
      });
    }
    await commitHostCommand({ type: "select-act", actId });
  }

  async function resetGame() {
    await commitHostCommand({ type: "force-hub" });
  }

  async function togglePause() {
    await commitHostCommand({ type: state.paused ? "resume" : "pause" });
  }

  async function skipPhase() {
    await commitHostCommand({ type: "skip-phase" });
  }

  async function restartCurrentGame() {
    await commitHostCommand({ type: "restart-game" });
  }

  async function forceBackToHub() {
    await commitHostCommand({ type: "force-hub" });
  }

  async function finishParty() {
    await commitHostCommand({ type: "finish-party" });
  }

  async function resumeParty() {
    await commitHostCommand({ type: "resume-party" });
  }

  async function startNewParty() {
    await commitHostCommand({ type: "start-new-party" });
  }

  async function resetScores() {
    if (!window.confirm("Reset all team scores? This cannot be undone.")) return;
    await commitHostCommand({ type: "reset-scores" });
  }

  async function addTeam(name: string) {
    await commitHostCommand({ type: "add-team", teamId: genId("team"), name });
  }

  async function renameTeam(teamId: string, name: string) {
    await commitHostCommand({ type: "rename-team", teamId, name });
  }

  async function removeTeam(teamId: string) {
    await commitHostCommand({ type: "remove-team", teamId });
  }

  async function removePlayer(playerId: string, playerName: string) {
    if (
      !window.confirm(
        `Remove ${playerName} from this lobby? Use this only for a duplicate or inactive phone.`,
      )
    ) {
      return;
    }
    await commitHostCommand({ type: "remove-player", playerId });
  }

  async function setAiMode(mode: "auto" | "manual") {
    await commitHostCommand({ type: "set-ai-mode", mode });
  }

  async function setAiBudget(limitCredits: number) {
    await commitHostCommand({ type: "set-ai-budget", limitCredits });
  }

  async function prepareAi(gameId: AiPrewarmGameId, targetActId: PartyActId) {
    await prewarmAiGameClient({ roomId, gameId, targetActId });
  }

  async function completeRouteStep(stepId: string) {
    await commitHostCommand({ type: "complete-run-step", stepId });
  }

  async function beginRouteStep(stepId: string) {
    await commitHostCommand({ type: "begin-run-step", stepId });
  }

  return (
    <main className="agh-host min-h-dvh bg-background text-foreground">
      <header className="agh-host-masthead">
        <div className="agh-host-masthead-inner">
          <Link to="/" className="agh-host-brand" aria-label="AI Game Hub home">
            <strong>AI GAME HUB</strong>
            <span>
              Live party
              <br />
              operating system
            </span>
          </Link>
          <div className="agh-host-program">{hostProgramLabel}</div>
          <div className="agh-host-code">
            <span>Room code</span>
            <strong>{code}</strong>
          </div>
        </div>
      </header>

      <div className="agh-host-layout">
        <div className="lg:hidden">
          <LiveSafetyPanel
            roomId={roomId}
            roomCode={code}
            state={state}
            releaseHealth={releaseHealth}
            connectionStatus={connectionStatus}
            lastSyncedAt={lastSyncedAt}
            onResync={() => runHostAction(onResync)}
            onSetAiMode={(mode) => runHostAction(() => setAiMode(mode))}
            onSetAiBudget={(limitCredits) => runHostAction(() => setAiBudget(limitCredits))}
            onTogglePause={() => runHostAction(togglePause)}
            onForceHub={() => runHostAction(forceBackToHub)}
            onRefreshReleaseHealth={() => void refreshReleaseHealth()}
          />
        </div>
        <section
          data-testid="host-runtime"
          data-game-id={state.currentGame ?? ""}
          data-game-phase={activeGamePhase(state) ?? ""}
          data-paused={state.paused ? "true" : "false"}
          data-party-status={state.status}
          className="agh-host-runtime"
        >
          {state.currentGame && (
            <HostControlBar
              state={state}
              canSkip={canSkipCurrentPhase(state)}
              onTogglePause={() => runHostAction(togglePause)}
              onSkip={() => runHostAction(skipPhase)}
              onRestart={() => runHostAction(restartCurrentGame)}
              onBackToHub={() => runHostAction(forceBackToHub)}
            />
          )}

          {hostActionError && (
            <HostActionErrorBanner
              message={hostActionError}
              onDismiss={() => setHostActionError(null)}
            />
          )}

          {state.status !== "finished" && state.smokescreen && (
            <SmokeScreenBackgroundHost roomId={roomId} state={state} />
          )}
          {state.status !== "finished" && state.contraband && (
            <ContrabandBackgroundHost roomId={roomId} state={state} />
          )}
          {state.status !== "finished" && state.tongsoftruth && (
            <TongsOfTruthBackgroundHost roomId={roomId} state={state} />
          )}

          {state.status === "finished" ? (
            <PartyFinale
              roomId={roomId}
              state={state}
              onResumeParty={() => runHostAction(resumeParty)}
              onNewParty={() => runHostAction(startNewParty)}
            />
          ) : state.currentGame ? (
            <Suspense fallback={<HostGameLoading />}>
              <ActiveHostGameView
                roomId={roomId}
                code={code}
                state={state}
                onBackToHub={() => runHostAction(forceBackToHub)}
                fallback={<HostGameLoading />}
              />
            </Suspense>
          ) : (
            <Lobby
              roomId={roomId}
              totalPlayers={totalPlayers}
              code={code}
              joinUrl={joinUrl}
              onLaunchGame={(gameId) => runHostAction(() => launchGame(gameId))}
              onSelectExperience={(experienceId, contingency) =>
                runHostAction(() => selectExperience(experienceId, contingency))
              }
              onSelectAct={(actId) => runHostAction(() => selectAct(actId))}
              onFinishParty={() => runHostAction(finishParty)}
              onPrepareAi={(gameId, targetActId) =>
                runHostAction(() => prepareAi(gameId, targetActId))
              }
              onBeginRouteStep={(stepId) => runHostAction(() => beginRouteStep(stepId))}
              onCompleteRouteStep={(stepId) => runHostAction(() => completeRouteStep(stepId))}
              speakerUrlFor={speakerUrlFor}
              onTestSpeaker={testSpeaker}
              onAddTeam={addTeam}
              onRenameTeam={renameTeam}
              onRemoveTeam={removeTeam}
              state={state}
              releaseHealth={releaseHealth}
            />
          )}
        </section>

        <aside className="agh-host-aside space-y-4">
          <div className="hidden lg:block">
            <LiveSafetyPanel
              roomId={roomId}
              roomCode={code}
              state={state}
              releaseHealth={releaseHealth}
              connectionStatus={connectionStatus}
              lastSyncedAt={lastSyncedAt}
              onResync={() => runHostAction(onResync)}
              onSetAiMode={(mode) => runHostAction(() => setAiMode(mode))}
              onSetAiBudget={(limitCredits) => runHostAction(() => setAiBudget(limitCredits))}
              onTogglePause={() => runHostAction(togglePause)}
              onForceHub={() => runHostAction(forceBackToHub)}
              onRefreshReleaseHealth={() => void refreshReleaseHealth()}
            />
          </div>
          <Scoreboard state={state} onResetScores={() => runHostAction(resetScores)} />
          <PlayersList
            state={state}
            onRemovePlayer={(playerId, playerName) =>
              runHostAction(() => removePlayer(playerId, playerName))
            }
          />
          <button onClick={() => runHostAction(resetGame)} className="agh-host-reset">
            ↺ Reset to lobby
          </button>
        </aside>
      </div>
    </main>
  );
}

function LiveSafetyPanel({
  roomId,
  roomCode,
  state,
  releaseHealth,
  connectionStatus,
  lastSyncedAt,
  onResync,
  onSetAiMode,
  onSetAiBudget,
  onTogglePause,
  onForceHub,
  onRefreshReleaseHealth,
}: {
  roomId: string;
  roomCode: string;
  state: RoomState;
  releaseHealth: ReleaseHealthLoadState;
  connectionStatus: RoomConnectionStatus;
  lastSyncedAt: number | null;
  onResync: () => void;
  onSetAiMode: (mode: "auto" | "manual") => void;
  onSetAiBudget: (limitCredits: number) => void;
  onTogglePause: () => void;
  onForceHub: () => void;
  onRefreshReleaseHealth: () => void;
}) {
  const manualAi = state.party?.aiMode === "manual";
  const aiRuntime = normalizeAiRuntimeState(state.aiRuntime);
  const aiRemaining = Math.max(0, aiRuntime.limitCredits - aiRuntime.usedCredits);
  const aiPercent = Math.min(100, (aiRuntime.usedCredits / aiRuntime.limitCredits) * 100);
  const launchSignal = getCurrentQuickStartLaunchSignal(state, releaseHealth.status);
  const status = {
    connecting: { label: "connecting", color: "bg-amber-300" },
    live: { label: "live", color: "bg-emerald-300" },
    reconnecting: { label: "resyncing", color: "bg-amber-300" },
    offline: { label: "offline", color: "bg-red-300" },
    error: { label: "sync error", color: "bg-red-300" },
  }[connectionStatus];

  return (
    <section
      id="live-safety"
      data-testid="live-safety"
      data-connection-status={connectionStatus}
      className="rounded-3xl border border-white/10 bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Live safety
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className={`size-2 rounded-full ${status.color}`} />
            <span className="font-medium">{status.label}</span>
            {lastSyncedAt && (
              <span className="text-xs text-muted-foreground">
                {new Date(lastSyncedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onResync}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/75 hover:text-white"
        >
          Resync
        </button>
      </div>

      <div
        data-testid="release-health"
        data-status={releaseHealth.status}
        className={`mt-3 rounded-2xl border p-3 ${
          releaseHealth.status === "ready"
            ? "border-emerald-200/25 bg-emerald-400/8"
            : releaseHealth.status === "checking"
              ? "border-white/10 bg-white/[0.03]"
              : "border-red-200/25 bg-red-400/10"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium">
              {releaseHealth.status === "checking"
                ? "Checking live backend…"
                : releaseHealth.status === "ready"
                  ? "Live backend ready"
                  : releaseHealth.status === "degraded"
                    ? "Backend setup required"
                    : "Backend check failed"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {releaseHealth.status === "checking"
                ? "Verifying private memory, scoring, media storage and AI."
                : releaseHealth.status === "ready"
                  ? "Private memory, scoring, uploads and AI passed server-side checks."
                  : releaseHealth.status === "error"
                    ? releaseHealth.message
                    : "The room remains usable, but do not promise the full live scenario yet."}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshReleaseHealth}
            disabled={releaseHealth.status === "checking"}
            className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[10px] text-white/75 disabled:opacity-35"
          >
            Retry
          </button>
        </div>
        {"report" in releaseHealth && (
          <div className="mt-2 space-y-1.5">
            {releaseHealth.report.checks.map((check) => (
              <div
                key={check.id}
                data-check-id={check.id}
                data-ready={check.ready ? "true" : "false"}
                className="text-[11px] leading-relaxed"
              >
                <span className={check.ready ? "text-emerald-300" : "text-red-200"}>
                  {check.ready ? "✓" : "!"}
                </span>{" "}
                <span className="font-medium text-white/80">{check.title}:</span>{" "}
                <span className="text-muted-foreground">{check.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className={`mt-3 rounded-2xl border p-3 ${
          manualAi ? "border-amber-200/30 bg-amber-400/10" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="text-xs font-medium">
          {manualAi ? "Manual AI fallback is on" : "AI mode: automatic"}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {manualAi
            ? "New prompt calls use deterministic fallback cards. Scores and secrets stay server-side."
            : "If the provider stalls, switch once and keep the room moving."}
        </p>
        <button
          type="button"
          onClick={() => onSetAiMode(manualAi ? "auto" : "manual")}
          className="mt-2 w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15"
        >
          {manualAi ? "Try AI again" : "Use manual fallbacks"}
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">AI budget</span>
          <span className={aiRemaining === 0 ? "text-red-300" : "text-white/70"}>
            {aiRuntime.usedCredits}/{aiRuntime.limitCredits} credits
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${aiPercent >= 90 ? "bg-red-300" : aiPercent >= 70 ? "bg-amber-300" : "bg-emerald-300"}`}
            style={{ width: `${aiPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {aiRemaining === 0
            ? "Limit reached: new text, vision and speech-to-text calls use deterministic fallbacks."
            : `${aiRemaining} left · ${aiRuntime.providerRequests} provider requests · ${(aiRuntime.inputTokens + aiRuntime.outputTokens).toLocaleString()} tokens`}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {[60, 120, 240].map((limit) => (
            <button
              key={limit}
              type="button"
              onClick={() => onSetAiBudget(limit)}
              disabled={limit < aiRuntime.usedCredits || limit === aiRuntime.limitCredits}
              className="rounded-lg bg-white/8 px-2 py-1.5 text-[10px] text-white/70 disabled:opacity-35"
            >
              {limit}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          disabled={!state.currentGame}
          className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white disabled:opacity-35"
        >
          {state.paused ? "Resume room" : "Pause room"}
        </button>
        <button
          type="button"
          onClick={onForceHub}
          disabled={!state.currentGame}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 disabled:opacity-35"
        >
          Safe return to hub
        </button>
      </div>

      <HostAccessBackup roomCode={roomCode} />

      <FieldReportPanel
        key={`${roomId}:${state.quickStart?.configuredAt ?? "classic"}`}
        roomId={roomId}
        roomCode={roomCode}
        state={state}
        launchSignal={launchSignal}
        releaseHealth={{
          status: releaseHealth.status,
          ...(releaseHealth.status === "ready" || releaseHealth.status === "degraded"
            ? {
                checks: Object.fromEntries(
                  releaseHealth.report.checks.map((check) => [check.id, check.ready]),
                ),
              }
            : {}),
        }}
      />

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-white/75">
          60-second emergency card
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
          <li>Pause. Keep this host tab open and read the room code aloud.</li>
          <li>Set manual fallbacks if AI or speech-to-text is the problem.</li>
          <li>Restore Wi-Fi/mobile data, then press Resync once.</li>
          <li>Skip the phase or return to hub; never edit SQL or room state.</li>
        </ol>
      </details>
    </section>
  );
}

function HostAccessBackup({ roomCode }: { roomCode: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyBackupLink() {
    const hostSecret = getHostSecret(roomCode);
    if (!hostSecret) {
      setCopyState("error");
      return;
    }
    try {
      const backupUrl = buildHostAccessUrl(window.location.origin, roomCode, hostSecret);
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(backupUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2_000);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs">
      <summary className="cursor-pointer font-medium text-white/80">Backup host device</summary>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Copy once before guests arrive and open it on one trusted backup device. The private link
        grants full host control until room cleanup. Never show it as a QR or post it in group chat.
      </p>
      <button
        type="button"
        data-testid="copy-host-access"
        onClick={() => void copyBackupLink()}
        className="mt-2 w-full rounded-xl bg-white/10 px-3 py-2 font-medium text-white hover:bg-white/15"
      >
        {copyState === "copied"
          ? "Private link copied"
          : copyState === "error"
            ? "Could not copy — retry"
            : "Copy private backup link"}
      </button>
    </details>
  );
}

function HostGameLoading() {
  return (
    <div className="rounded-3xl border border-white/10 bg-card p-8 text-center">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Game</div>
      <div className="font-display mt-2 text-3xl">Preparing round screen…</div>
    </div>
  );
}

function HostActionErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-3xl border border-red-300/25 bg-red-500/15 px-4 py-3 text-red-50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-red-100/70">
            Host action failed
          </div>
          <p className="mt-1 text-sm leading-relaxed">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function formatRoundPhaseLabel(game: GameId | null | undefined, phase: string | null | undefined) {
  if (!game || !phase) return null;
  const labels: Partial<Record<GameId, Record<string, string>>> = {
    soundscape: {
      idle: "Paused",
      topics: "Theme",
      recording: "Recording",
      mixing: "Mix",
      playback: "Playback",
      voting: "Voting",
      results: "Results",
    },
    challenge: {
      briefing: "Briefing",
      recording: "Recording",
      judging: "Judging",
      results: "Verdict",
    },
    phototunt: {
      briefing: "Briefing",
      hunting: "Hunt",
      judging: "Judging",
      results: "Results",
    },
    trackguess: {
      briefing: "Start",
      listening: "Listening",
      guessing: "Voting",
      reveal: "Answer",
      results: "Results",
    },
    spectrumcourt: {
      briefing: "Start",
      clue: "Clue",
      guessing: "Guessing",
      appeal: "Appeal",
      reveal: "Reveal",
      results: "Results",
    },
    whoamong: {
      briefing: "Start",
      voting: "Voting",
      reveal: "Reveal",
      results: "Results",
    },
    impostor: {
      briefing: "Start",
      answering: "Writing",
      voting: "Bot hunt",
      reveal: "Reveal",
      results: "Results",
    },
  };
  return labels[game]?.[phase] ?? phase;
}

function HostControlBar({
  state,
  canSkip,
  onTogglePause,
  onSkip,
  onRestart,
  onBackToHub,
}: {
  state: RoomState;
  canSkip: boolean;
  onTogglePause: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onBackToHub: () => void;
}) {
  const gameLabel = activeGame(state)?.title ?? "Game";
  const phase = activeGamePhase(state);
  const phaseLabel = formatRoundPhaseLabel(state.currentGame, phase);

  return (
    <div
      data-testid="host-game-controls"
      data-game-id={state.currentGame ?? ""}
      data-game-phase={phase ?? ""}
      data-paused={state.paused ? "true" : "false"}
      className="agh-live-controls"
    >
      <div className="agh-live-controls-copy">
        <div className="agh-live-controls-meta">
          <span>Live round</span>
          <strong>{state.paused ? "Paused" : (phaseLabel ?? "In progress")}</strong>
        </div>
        <div className="agh-live-controls-title">
          <strong>{gameLabel}</strong>
          <span>{state.paused ? "The room is holding." : "Keep the room moving."}</span>
        </div>
      </div>
      <div className="agh-live-control-actions">
        <button
          data-testid="host-toggle-pause"
          data-action={state.paused ? "resume" : "pause"}
          onClick={onTogglePause}
          className="is-primary"
        >
          {state.paused ? "Resume" : "Pause"}
        </button>
        <button data-testid="host-skip-phase" onClick={onSkip} disabled={!canSkip}>
          Skip phase
        </button>
        <button data-testid="host-restart-game" onClick={onRestart}>
          Restart
        </button>
        <button data-testid="host-back-to-hub" onClick={onBackToHub}>
          To hub
        </button>
      </div>
    </div>
  );
}

function speak(text: string, roomId: string) {
  const a = new Audio(speechUrl(text, roomId));
  a.play().catch(() => {});
}

function humanizeRunStep(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isImplementedRunStep(step: RunOfShowStep): boolean {
  return !("gameId" in step) || (GAME_IDS as readonly string[]).includes(step.gameId);
}

function QuickStartReadinessPanel({
  state,
  releaseHealth,
  onBeginRouteStep,
  onShowQr,
}: {
  state: RoomState;
  releaseHealth: ReleaseHealthLoadState;
  onBeginRouteStep: (stepId: string) => void;
  onShowQr: () => void;
}) {
  const readiness = getQuickStartReadiness(state);
  const setup = state.quickStart;
  if (!readiness || !setup) return null;

  const profile = QUICK_START_PROFILES[setup.venue];
  const elapsedSeconds = Math.floor(readiness.elapsedMs / 1000);
  const playerTargetReached = readiness.joinedPlayers >= readiness.minimumPlayers;
  const devices = summarizePlayerDeviceChecks(state.players);
  const backendReady = releaseHealth.status === "ready";
  const liveReady = readiness.ready && backendReady;
  const party = state.party;
  const progress =
    party &&
    state.runOfShow?.experienceId === party.experienceId &&
    state.runOfShow.contingency === party.contingency
      ? state.runOfShow
      : undefined;
  const nextStep = party
    ? getNextIncompleteRouteStep(party, progress?.completedStepIds ?? [])
    : undefined;
  const activeInterlude =
    nextStep?.kind === "interlude" && progress?.activeStepId === nextStep.id ? nextStep : undefined;
  const partyStarted = Boolean(progress?.activeStepId || progress?.completedStepIds.length);
  const canBegin = liveReady && !partyStarted && nextStep?.kind === "interlude";
  const launchCoach = partyStarted
    ? undefined
    : buildQuickStartLaunchCoach(readiness, releaseHealth.status);
  const launchStatus = partyStarted
    ? "Party live"
    : releaseHealth.status === "checking"
      ? "Checking backend"
      : releaseHealth.status === "degraded" || releaseHealth.status === "error"
        ? "Backend setup required"
        : readiness.ready
          ? readiness.readyWithinTwoMinutes
            ? "Ready inside 2 minutes"
            : "Ready to start"
          : "Waiting for the room";
  const launchTone = liveReady
    ? "ready"
    : releaseHealth.status === "degraded" || releaseHealth.status === "error"
      ? "blocked"
      : "waiting";
  const launchFacts = [
    {
      label: "Program",
      value: readiness.routeMatchesPromise
        ? `${readiness.routeDurationMinutes} minutes, exact route`
        : `${readiness.routeDurationMinutes}/${setup.targetDurationMinutes} minutes`,
    },
    {
      label: "Phones",
      value:
        devices.total > 0
          ? `${devices.ready}/${devices.total} media ready`
          : `${readiness.joinedPlayers}/${readiness.minimumPlayers} minimum`,
    },
    {
      label: "First cue",
      value: nextStep
        ? `${getRunStepLabel(nextStep, party?.uiLocale ?? "en")} · ${nextStep.durationMinutes} min`
        : "Program complete",
    },
  ] as const;
  return (
    <section
      data-testid="quick-start-readiness"
      data-ready={liveReady ? "true" : "false"}
      data-program-ready={readiness.ready ? "true" : "false"}
      data-backend-ready={backendReady ? "true" : "false"}
      data-backend-status={releaseHealth.status}
      data-ready-within-two-minutes={readiness.readyWithinTwoMinutes ? "true" : "false"}
      data-venue={setup.venue}
      data-duration-minutes={setup.targetDurationMinutes}
      data-route-duration-minutes={readiness.routeDurationMinutes}
      data-expected-players={setup.expectedPlayers}
      data-joined-players={readiness.joinedPlayers}
      data-within-player-capacity={readiness.withinPlayerCapacity ? "true" : "false"}
      data-device-checked-players={devices.checked}
      data-device-ready-players={devices.ready}
      data-party-started={partyStarted ? "true" : "false"}
      data-launch-coach-state={launchCoach?.state ?? "party-live"}
      data-active-route-step-id={progress?.activeStepId ?? ""}
      className="agh-host-readiness"
    >
      {!partyStarted && launchCoach && (
        <QuickStartLaunchSignalPanel
          coach={launchCoach}
          stepId={nextStep?.id}
          canBegin={canBegin}
          onBeginRouteStep={onBeginRouteStep}
          onShowQr={onShowQr}
          venue={setup.venue}
          durationMinutes={setup.targetDurationMinutes}
          elapsedSeconds={elapsedSeconds}
          joinedPlayers={readiness.joinedPlayers}
          backendStatus={releaseHealth.status}
          facts={launchFacts}
        />
      )}
      {partyStarted && (
        <div className="agh-readiness-head">
          <div>
            <span>Start desk</span>
            <h2>{profile.title}</h2>
            <p>
              {setup.targetDurationMinutes / 60} hours · {setup.expectedPlayers} expected ·
              configured {elapsedSeconds}s ago
            </p>
          </div>
          <div className={`agh-readiness-verdict is-${launchTone}`}>
            <span>{liveReady ? "System live" : "System check"}</span>
            <strong>{launchStatus}</strong>
          </div>
        </div>
      )}
      <div className="agh-readiness-grid">
        <ReadinessCheck
          ready={readiness.routeMatchesPromise}
          title="Program assembled"
          detail={`${readiness.routeDurationMinutes} minute run of show`}
        />
        <ReadinessCheck ready title="Join route live" detail="QR and room code are active" />
        <ReadinessCheck
          ready={readiness.withinPlayerCapacity}
          title={`${readiness.joinedPlayers}/${readiness.maximumPlayers} capacity`}
          detail={
            readiness.withinPlayerCapacity
              ? "Room stays inside the supported crowd size"
              : "Remove duplicate or inactive phones before launch"
          }
        />
        <ReadinessCheck
          ready={playerTargetReached}
          title={`${readiness.joinedPlayers}/${setup.expectedPlayers} joined`}
          detail={
            playerTargetReached
              ? "Minimum live group reached"
              : `${readiness.minimumPlayers - readiness.joinedPlayers} more for the 8-person minimum`
          }
        />
        <ReadinessCheck
          ready={devices.total > 0 && devices.ready === devices.total}
          title={`${devices.ready}/${devices.total} media ready`}
          detail={
            devices.blocked > 0
              ? `${devices.blocked} phone${devices.blocked === 1 ? "" : "s"} need permission help`
              : devices.checked < devices.total
                ? "Optional camera + mic preflight still available"
                : "Every joined phone passed camera + mic"
          }
        />
        <ReadinessCheck
          ready={backendReady}
          title={backendReady ? "Backend ready" : "Backend preflight"}
          detail={
            releaseHealth.status === "checking"
              ? "Checking private server dependencies"
              : releaseHealth.status === "degraded"
                ? "Open Live safety for the required setup"
                : releaseHealth.status === "error"
                  ? "Retry from Live safety before launch"
                  : "Memory, scoring, media and AI passed"
          }
        />
      </div>
      <QuickStartBriefCard context="host" input={setup} />
      {activeInterlude ? (
        <div className="agh-first-cue is-live">
          <span>First cue live</span>
          <strong>{getRunStepLabel(activeInterlude, party?.uiLocale ?? "en")}</strong>
          <p>{getRunStepCue(activeInterlude, party?.uiLocale ?? "en")}</p>
          <small>
            The timer is running. When the room has landed, complete this moment in Party conductor.
          </small>
        </div>
      ) : partyStarted ? (
        <p className="agh-first-cue is-live">
          The party is live. Follow the next recommended cue in Party conductor.
        </p>
      ) : null}
    </section>
  );
}

function QuickStartLaunchSignalPanel({
  coach,
  stepId,
  canBegin,
  onBeginRouteStep,
  onShowQr,
  venue,
  durationMinutes,
  elapsedSeconds,
  joinedPlayers,
  backendStatus,
  facts,
}: {
  coach: QuickStartLaunchCoach;
  stepId?: string;
  canBegin: boolean;
  onBeginRouteStep: (stepId: string) => void;
  onShowQr: () => void;
  venue: string;
  durationMinutes: number;
  elapsedSeconds: number;
  joinedPlayers: number;
  backendStatus: ReleaseHealthLoadState["status"];
  facts: readonly { label: string; value: string }[];
}) {
  const actionClass = "agh-launch-action";

  let action: ReactNode;
  if (coach.action === "start") {
    action = (
      <button
        type="button"
        data-testid="quick-start-begin"
        data-step-id={stepId ?? ""}
        onClick={() => stepId && onBeginRouteStep(stepId)}
        disabled={!canBegin}
        className={`${actionClass} is-primary`}
      >
        <span>{coach.actionLabel}</span>
        <b aria-hidden="true">↗</b>
      </button>
    );
  } else if (coach.action === "show-qr") {
    action = (
      <button
        type="button"
        data-testid="quick-start-show-qr"
        onClick={onShowQr}
        className={`${actionClass} is-secondary`}
      >
        <span>{coach.actionLabel}</span>
        <b aria-hidden="true">↗</b>
      </button>
    );
  } else if (coach.action === "live-safety") {
    action = (
      <a
        data-testid="quick-start-open-live-safety"
        href="#live-safety"
        className={`${actionClass} is-secondary`}
      >
        <span>{coach.actionLabel}</span>
        <b aria-hidden="true">↗</b>
      </a>
    );
  } else if (coach.action === "home") {
    action = (
      <Link data-testid="quick-start-rebuild-room" to="/" className={`${actionClass} is-secondary`}>
        <span>{coach.actionLabel}</span>
        <b aria-hidden="true">↗</b>
      </Link>
    );
  } else if (coach.action === "players") {
    action = (
      <a
        data-testid="quick-start-open-players"
        href="#player-roster"
        className={`${actionClass} is-secondary`}
      >
        <span>{coach.actionLabel}</span>
        <b aria-hidden="true">↗</b>
      </a>
    );
  } else {
    action = (
      <button
        type="button"
        data-testid="quick-start-wait"
        disabled
        className={`${actionClass} is-waiting`}
      >
        {coach.actionLabel}
      </button>
    );
  }

  return (
    <QuickStartLaunchSignal
      coach={coach}
      venue={venue}
      durationMinutes={durationMinutes}
      elapsedSeconds={elapsedSeconds}
      joinedPlayers={joinedPlayers}
      backendStatus={backendStatus}
      facts={facts}
      action={action}
    />
  );
}

function ReadinessCheck({
  ready,
  title,
  detail,
}: {
  ready: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className={`agh-readiness-check ${ready ? "is-ready" : "is-waiting"}`}>
      <span aria-hidden="true">{ready ? "✓" : "○"}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function Lobby({
  roomId,
  totalPlayers,
  code,
  joinUrl,
  onLaunchGame,
  onSelectExperience,
  onSelectAct,
  onFinishParty,
  onPrepareAi,
  onBeginRouteStep,
  onCompleteRouteStep,
  speakerUrlFor,
  onTestSpeaker,
  onAddTeam,
  onRenameTeam,
  onRemoveTeam,
  state,
  releaseHealth,
}: {
  roomId: string;
  totalPlayers: number;
  code: string;
  joinUrl: string;
  onLaunchGame: (gameId: GameId) => void;
  onSelectExperience: (experienceId: ExperienceId, contingency: ContingencyPlan) => void;
  onSelectAct: (actId: PartyActId) => void;
  onFinishParty: () => void;
  onPrepareAi: (gameId: AiPrewarmGameId, targetActId: PartyActId) => Promise<void>;
  onBeginRouteStep: (stepId: string) => void;
  onCompleteRouteStep: (stepId: string) => void;
  speakerUrlFor: (n: number) => string;
  onTestSpeaker: (n: number) => void;
  onAddTeam: (name: string) => Promise<void>;
  onRenameTeam: (teamId: string, name: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
  state: import("@/lib/types").RoomState;
  releaseHealth: ReleaseHealthLoadState;
}) {
  const [copied, setCopied] = useState(false);
  const [fullscreenQr, setFullscreenQr] = useState(false);

  const extrasConnected = [2, 3, 4, 5].filter(
    (s) => speakerReadiness(s, state.speakerSlots?.[s]).status === "ready",
  ).length;
  const hasPlayers = totalPlayers > 0;
  const canChallenge = totalPlayers >= 2;
  const canPhoto = totalPlayers >= 1;
  const canSoundscape = totalPlayers >= 1;
  const canTrackGuess = totalPlayers >= 1;
  const activeTeamCount = state.teams.filter((team) =>
    state.players.some((player) => player.teamId === team.id),
  ).length;
  const canSpectrumCourt = activeTeamCount >= 2;
  const canWhoAmong = totalPlayers >= 3;
  const canImpostor = totalPlayers >= 3;
  const hasScores = state.teams.some((team) => team.score > 0);
  const venue = state.venue ?? "park";
  const party =
    state.party ?? contextForExperience("classic-park", venue === "bar" ? "bar-only" : "normal");
  const experience = getExperiencePack(party.experienceId);
  const route = getExperienceRoute(party.experienceId, party.contingency);
  const conductorLabels = getConductorLabels(party);
  const timeline = buildRouteTimeline(party);
  const nextRecommended = getNextRecommendedRouteStep(party);

  function copyLink() {
    navigator.clipboard?.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (fullscreenQr) {
    return (
      <SetupFullscreen
        code={code}
        joinUrl={joinUrl}
        totalPlayers={totalPlayers}
        onClose={() => setFullscreenQr(false)}
      />
    );
  }

  return (
    <div className="agh-host-lobby space-y-4">
      <div className="agh-host-lobby-status">
        <div>
          <span>Room signal</span>
          <strong>{totalPlayers}</strong>
          <small>{totalPlayers === 1 ? "player is in" : "players are in"}</small>
        </div>
        <button type="button" onClick={() => setFullscreenQr(true)} className="agh-host-show-qr">
          <span>Put the join code on screen</span>
          <b aria-hidden="true">↗</b>
        </button>
      </div>

      <QuickStartReadinessPanel
        state={state}
        releaseHealth={releaseHealth}
        onBeginRouteStep={onBeginRouteStep}
        onShowQr={() => setFullscreenQr(true)}
      />

      {party.experienceId !== "classic-park" && (
        <HostConductor
          roomId={roomId}
          state={state}
          onLaunchGame={onLaunchGame}
          onSelectExperience={onSelectExperience}
          onSelectAct={onSelectAct}
          onFinishParty={onFinishParty}
          onPrepareAi={onPrepareAi}
          onBeginRouteStep={onBeginRouteStep}
          onCompleteRouteStep={onCompleteRouteStep}
        />
      )}

      <TeamManager
        state={state}
        onAddTeam={onAddTeam}
        onRenameTeam={onRenameTeam}
        onRemoveTeam={onRemoveTeam}
      />

      <section className="agh-host-join-station">
        <header>
          <h3>Bring everyone in.</h3>
          <p>Scan the QR or enter the four-character room code.</p>
        </header>
        <div className="agh-host-join-grid">
          <div className="agh-host-code-panel">
            <span>Join from any phone</span>
            <strong>{code}</strong>
            <p>No download. Name and team stay on the phone.</p>
          </div>
          <div className="agh-host-qr-panel">
            <div className="agh-host-qr-frame">
              <QRCodeCanvas value={joinUrl} size={220} level="M" includeMargin={false} />
            </div>
            <p>{joinUrl}</p>
            <button type="button" onClick={copyLink}>
              {copied ? "Link copied" : "Copy join link"}
            </button>
          </div>
        </div>
      </section>

      <details className="agh-host-speakers group">
        <summary>
          <span>Speakers</span>
          <small>Optional for Soundscape Battle</small>
        </summary>
        <p>
          Only needed for Soundscape Battle. Use Bluetooth from the host phone or separate speaker
          phones.
        </p>
        <div className="agh-host-speaker-actions">
          <button type="button" onClick={() => onTestSpeaker(1)}>
            Test main speaker
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[2, 3, 4, 5].map((slot) => (
            <SpeakerQrCard
              key={slot}
              slot={slot}
              url={speakerUrlFor(slot)}
              state={state}
              onTest={() => onTestSpeaker(slot)}
            />
          ))}
        </div>
      </details>

      {party.experienceId === "classic-park" && (
        <div
          className={`rounded-3xl park-gradient p-6 text-white ${hasPlayers ? "" : "opacity-70"}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/80">
                Party conductor
              </div>
              <h3 className="font-display text-2xl mt-0.5">{experience.title[party.uiLocale]}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXPERIENCE_IDS.map((experienceId) => {
                  const optionPack = getExperiencePack(experienceId);
                  const optionAct = optionPack.acts[0];
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
                      className={`rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                        party.experienceId === experienceId
                          ? "bg-white text-[oklch(0.2_0.05_160)]"
                          : "border border-white/20 text-white/70 hover:text-white"
                      }`}
                    >
                      {optionAct?.emoji} {optionPack.shortTitle[party.uiLocale]}
                    </button>
                  );
                })}
              </div>
              {party.experienceId === "classic-park" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "normal", label: "🌳 Park" },
                      { id: "bar-only", label: "🍸 Bar" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectExperience(party.experienceId, option.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        party.contingency === option.id
                          ? "border-white bg-white/20 text-white"
                          : "border-white/20 text-white/60 hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {route.actOrder.map((actId) => {
                  const act = getExperienceAct(party.experienceId, actId);
                  if (!act) return null;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => onSelectAct(act.id)}
                      className={`rounded-full px-3 py-1.5 text-xs transition ${
                        party.actId === act.id
                          ? "bg-black/30 text-white ring-1 ring-white/40"
                          : "bg-white/10 text-white/65 hover:text-white"
                      }`}
                    >
                      {act.emoji} {act.label[party.uiLocale]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 max-w-xl text-xs text-white/70">
                {getExperienceAct(party.experienceId, party.actId)?.environmentContext[
                  party.uiLocale
                ] ?? "Choose an act, then launch a game from the library below."}
              </p>
              {nextRecommended && isImplementedRunStep(nextRecommended) && (
                <div className="mt-4 rounded-2xl border border-white/20 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/60">
                    Next recommended · {conductorLabels.contingencyLabel}
                  </div>
                  <div className="mt-1 font-display text-xl text-white">
                    {humanizeRunStep(nextRecommended.id)}
                  </div>
                  <div className="mt-1 text-xs text-white/65">
                    {nextRecommended.durationMinutes} min · {humanizeRunStep(nextRecommended.kind)}
                    {nextRecommended.optional ? " · optional" : ""}
                  </div>
                </div>
              )}
              {nextRecommended && !isImplementedRunStep(nextRecommended) && (
                <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-950/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/70">
                    Program draft · not playable yet
                  </div>
                  <div className="mt-1 text-sm text-white/80">
                    {humanizeRunStep(nextRecommended.id)} is part of the upcoming signature-game
                    rollout. Launch one of the available games below for this act.
                  </div>
                </div>
              )}
              {timeline.length > 0 && (
                <details className="mt-3 rounded-2xl border border-white/15 bg-white/5 p-3">
                  <summary className="cursor-pointer text-xs text-white/75">
                    Run of show · {timeline.filter((item) => item.status === "past").length}/
                    {timeline.length} moments behind us
                  </summary>
                  <ol className="mt-3 space-y-1.5 text-xs">
                    {timeline.map(({ step, status }) => (
                      <li
                        key={step.id}
                        className={
                          status === "current"
                            ? "text-white"
                            : status === "past"
                              ? "text-white/35 line-through"
                              : "text-white/55"
                        }
                      >
                        {status === "past" ? "✓" : status === "current" ? "→" : "·"}{" "}
                        {humanizeRunStep(step.id)}
                        {!isImplementedRunStep(step) ? " · planned" : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            <button
              type="button"
              onClick={onFinishParty}
              disabled={!hasScores}
              className="rounded-2xl border border-white/25 bg-white/15 px-5 py-3 text-sm font-medium hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🏆 Party finale
            </button>
          </div>

          {!hasPlayers && (
            <p className="mt-3 text-white/80 text-sm">
              Have at least one friend scan the QR first.
            </p>
          )}

          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <GameCard
              gameId="soundscape"
              emoji="🎚️"
              title="Soundscape Battle"
              time="~7 minutes"
              desc="Teams capture park sounds; AI builds a 60-second mix across the speakers."
              disabled={!canSoundscape}
              disabledHint={
                !canSoundscape
                  ? "needs ≥ 1 player"
                  : extrasConnected === 0
                    ? "works without extra speakers"
                    : undefined
              }
              onClick={() => onLaunchGame("soundscape")}
            />
            <GameCard
              gameId="challenge"
              emoji="🎬"
              title="Park Spirit Challenge"
              time="~3 minutes per round"
              desc="One player films while others act out a scene. AI scores it 1–10."
              disabled={!canChallenge}
              disabledHint={!canChallenge ? "needs ≥ 2 players" : undefined}
              onClick={() => onLaunchGame("challenge")}
            />
            <GameCard
              gameId="phototunt"
              emoji="📸"
              title="Photo Hunt"
              time="~2 minutes per round"
              desc="AI gives an absurd prompt. Everyone gets 60 seconds for one shot."
              disabled={!canPhoto}
              disabledHint={!canPhoto ? "needs ≥ 1 player" : undefined}
              onClick={() => onLaunchGame("phototunt")}
            />
            <GameCard
              gameId="trackguess"
              emoji="🎧"
              title="Real or AI?"
              time="~5 rounds"
              desc="Play Spotify tracks from the host side, then make everyone guess human or machine."
              disabled={!canTrackGuess}
              disabledHint={!canTrackGuess ? "needs ≥ 1 player" : undefined}
              onClick={() => onLaunchGame("trackguess")}
            />
            <GameCard
              gameId="spectrumcourt"
              emoji="⚖️"
              title="Spectrum Court"
              time="~4 rounds"
              desc="One team gives a clue for a hidden point on a scale; others debate and place a marker."
              disabled={!canSpectrumCourt}
              disabledHint={!canSpectrumCourt ? "needs ≥ 2 active teams" : undefined}
              onClick={() => onLaunchGame("spectrumcourt")}
            />
            <GameCard
              gameId="whoamong"
              emoji="🕵️"
              title="Who Among Us"
              time="~5 rounds"
              desc="A pointed question appears — secretly vote for the player who fits best."
              disabled={!canWhoAmong}
              disabledHint={!canWhoAmong ? "needs ≥ 3 players" : undefined}
              onClick={() => onLaunchGame("whoamong")}
            />
            <GameCard
              gameId="impostor"
              emoji="🤖"
              title="Who's the Bot?"
              time="~4 rounds"
              desc="Everyone writes a witty answer — one is secretly AI. Find the machine."
              disabled={!canImpostor}
              disabledHint={!canImpostor ? "needs ≥ 3 players" : undefined}
              onClick={() => onLaunchGame("impostor")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SetupFullscreen({
  code,
  joinUrl,
  totalPlayers,
  onClose,
}: {
  code: string;
  joinUrl: string;
  totalPlayers: number;
  onClose: () => void;
}) {
  return (
    <div data-testid="setup-fullscreen-qr" className="agh-room-display">
      <header>
        <div className="agh-room-display-brand">
          <strong>AI GAME HUB</strong>
          <span>
            Live party
            <br />
            operating system
          </span>
        </div>
        <div className="agh-room-display-status">
          <span>Room signal</span>
          <strong>{totalPlayers} live</strong>
        </div>
        <button type="button" data-testid="setup-fullscreen-qr-close" onClick={onClose}>
          Close display
        </button>
      </header>

      <div className="agh-room-display-main">
        <section className="agh-room-display-code">
          <span>Join from any phone</span>
          <strong>{code}</strong>
          <p>No download. Camera and microphone wake up only when the game needs them.</p>
        </section>
        <section className="agh-room-display-qr">
          <div>
            <span>Point the camera here</span>
            <strong>{totalPlayers} already in</strong>
          </div>
          <div className="agh-room-display-qr-frame">
            <QRCodeCanvas value={joinUrl} size={320} level="M" includeMargin={false} />
          </div>
          <p>{joinUrl}</p>
        </section>
      </div>

      <section className="agh-room-display-roster">
        <span>Names update live · no avatars required</span>
        <strong>
          {totalPlayers === 0
            ? "THE ROOM IS OPEN."
            : `${totalPlayers} ${totalPlayers === 1 ? "PERSON IS" : "PEOPLE ARE"} IN.`}
        </strong>
      </section>

      <footer>
        <strong>EVERYTHING BECOMES EVIDENCE.</strong>
        <span>Host: say the first instruction out loud</span>
      </footer>
    </div>
  );
}

function SpeakerQrCard({
  slot,
  url,
  state,
  onTest,
  compact,
}: {
  slot: number;
  url: string;
  state: import("@/lib/types").RoomState;
  onTest: () => void;
  compact?: boolean;
}) {
  const sp = state.speakerSlots?.[slot];
  const readiness = speakerReadiness(slot, sp);
  const ready = readiness.status === "ready";
  const readyClass =
    readiness.status === "ready"
      ? "bg-[var(--color-park-bright)]/20 text-[var(--color-park-bright)]"
      : readiness.status === "stale"
        ? "bg-amber-300/15 text-amber-100"
        : "bg-white/5 text-white/50";

  if (!url) return null;

  return (
    <div
      className={`rounded-2xl border p-3 text-center ${compact ? "bg-white/95 border-white/20" : "bg-background/40 border-border"}`}
    >
      <div
        className={`inline-block rounded-lg p-1.5 ${compact ? "bg-white" : "bg-white ring-1 ring-black/10"}`}
      >
        <QRCodeCanvas value={url} size={compact ? 88 : 100} level="M" includeMargin={false} />
      </div>
      <div className={`mt-2 text-xs font-medium truncate ${compact ? "text-black" : ""}`}>
        {sp?.name ?? `Speaker ${slot}`}
      </div>
      <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${readyClass}`}>
          {readiness.label}
        </span>
        {ready && (
          <button
            type="button"
            onClick={onTest}
            className="text-[10px] rounded-full bg-white/10 hover:bg-white/20 px-2 py-0.5"
          >
            🔊 test
          </button>
        )}
      </div>
    </div>
  );
}

function TeamManager({
  state,
  onAddTeam,
  onRenameTeam,
  onRemoveTeam,
}: {
  state: RoomState;
  onAddTeam: (name: string) => Promise<void>;
  onRenameTeam: (teamId: string, name: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = state.teams.length < MAX_TEAMS;

  async function submitNewTeam(name: string) {
    if (!canAdd || busy) return;
    setBusy(true);
    try {
      await onAddTeam(name.trim() || suggestTeamName(state.teams));
      setNewName("");
    } catch {
      /* updateRoomState emits the visible host error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-card border-border p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl">Teams</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Players choose a team on their phones — names update live
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {state.teams.length}/{MAX_TEAMS}
        </span>
      </header>

      <div className="space-y-2">
        {state.teams.map((t) => {
          const c = teamColorClasses(t.color);
          const members = playersOnTeam(state, t.id);
          const canRemove = state.teams.length > 1 && members.length === 0;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${c.chip}`}
            >
              <span className={`size-3 shrink-0 rounded-full ${c.bg}`} />
              <input
                key={`${t.id}:${t.name}`}
                defaultValue={t.name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== t.name) {
                    void onRenameTeam(t.id, next).catch(() => {});
                  }
                }}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              />
              <span className="hidden sm:inline text-[10px] uppercase tracking-wide opacity-70 shrink-0">
                {members.length === 0
                  ? "empty"
                  : `${members.length} ${members.length === 1 ? "player" : "players"}`}
              </span>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => void onRemoveTeam(t.id).catch(() => {})}
                  className="shrink-0 rounded-full bg-black/10 hover:bg-black/20 size-7 text-sm"
                  aria-label={`Remove ${t.name}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canAdd ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitNewTeam(newName);
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={suggestTeamName(state.teams)}
            className="min-w-0 flex-1 rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            + Add
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Maximum {MAX_TEAMS} teams.</p>
      )}

      {canAdd && (
        <div className="mt-3 flex flex-wrap gap-2">
          {["Foxes", "Hedgehogs", "Owls", "Wolves"].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={
                busy || state.teams.some((t) => t.name.toLowerCase() === preset.toLowerCase())
              }
              onClick={() => void submitNewTeam(preset)}
              className="rounded-full border border-border bg-background/40 px-3 py-1 text-xs hover:bg-background/70 disabled:opacity-40"
            >
              + {preset}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitNewTeam(suggestTeamName(state.teams))}
            className="rounded-full border border-border bg-background/40 px-3 py-1 text-xs hover:bg-background/70 disabled:opacity-50"
          >
            + Quick team
          </button>
        </div>
      )}
    </section>
  );
}

function GameCard({
  gameId,
  emoji,
  title,
  time,
  desc,
  disabled,
  disabledHint,
  onClick,
}: {
  gameId: GameId;
  emoji: string;
  title: string;
  time: string;
  desc: string;
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-white/15 bg-white/10 transition ${
        disabled ? "opacity-40" : "hover:bg-white/15"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block w-full rounded-2xl p-4 pr-24 text-left active:bg-white/10 disabled:cursor-not-allowed"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-3xl">{emoji}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/60">{time}</div>
        </div>
        <div className="font-display text-xl mt-2">{title}</div>
        <p className="text-sm text-white/75 mt-1">{desc}</p>
        {disabled && disabledHint && (
          <div className="mt-2 text-xs text-white/55">{disabledHint}</div>
        )}
      </button>
      <div className="absolute right-4 top-4">
        <GameRulesDialogTrigger gameId={gameId} />
      </div>
    </div>
  );
}

function Scoreboard({
  state,
  onResetScores,
}: {
  state: import("@/lib/types").RoomState;
  onResetScores: () => void;
}) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  const hasScores = state.teams.some((team) => team.score > 0);
  return (
    <div className="rounded-3xl bg-card p-4 border">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Score</div>
        {hasScores && (
          <button
            type="button"
            onClick={onResetScores}
            className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Reset score
          </button>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map((t) => {
          const c = teamColorClasses(t.color);
          const count = state.players.filter((p) => p.teamId === t.id).length;
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between rounded-2xl px-3 py-2 border ${c.chip}`}
            >
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] uppercase tracking-wide opacity-70">
                  {count} {count === 1 ? "player" : "players"}
                </div>
              </div>
              <div className="font-display text-2xl tabular-num">{t.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayersList({
  state,
  onRemovePlayer,
}: {
  state: import("@/lib/types").RoomState;
  onRemovePlayer: (playerId: string, playerName: string) => void;
}) {
  const devices = summarizePlayerDeviceChecks(state.players);
  return (
    <div
      id="player-roster"
      data-testid="device-readiness-summary"
      data-total-players={devices.total}
      data-checked-players={devices.checked}
      data-ready-players={devices.ready}
      data-blocked-players={devices.blocked}
      className="scroll-mt-4 rounded-3xl bg-card p-4 border"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs uppercase tracking-widest text-muted-foreground">
        <span>Players ({state.players.length})</span>
        <span className="normal-case tracking-normal">
          {devices.ready}/{devices.total} media ready
        </span>
      </div>
      <div className="space-y-1 max-h-64 overflow-auto pr-1">
        {state.players.length === 0 && (
          <div className="text-xs text-muted-foreground">No one yet. Show the code to friends.</div>
        )}

        {state.players.map((p) => {
          const team = state.teams.find((t) => t.id === p.teamId);
          const c = team ? teamColorClasses(team.color) : null;
          const deviceStatus = playerDeviceCheckStatus(p.deviceCheck);
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className={`size-2 rounded-full ${c?.bg ?? "bg-white/30"}`} />
              <span>{p.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{team?.name}</span>
              <span
                data-testid={`host-player-device-${p.id}`}
                data-status={deviceStatus}
                className={
                  deviceStatus === "ready"
                    ? "text-emerald-300"
                    : deviceStatus === "unchecked"
                      ? "text-muted-foreground"
                      : "text-amber-300"
                }
                title={
                  deviceStatus === "ready"
                    ? "Camera and microphone ready"
                    : deviceStatus === "unchecked"
                      ? "Device not checked"
                      : "Camera or microphone needs attention"
                }
              >
                {deviceStatus === "ready"
                  ? "✓ media"
                  : deviceStatus === "unchecked"
                    ? "○ check"
                    : "! media"}
              </span>
              {canRemovePlayerBeforeParty(state) && (
                <button
                  type="button"
                  data-testid={`remove-player-${p.id}`}
                  onClick={() => onRemovePlayer(p.id, p.name)}
                  className="rounded-full border border-red-300/20 px-2 py-0.5 text-[10px] text-red-200 hover:bg-red-500/15"
                  aria-label={`Remove ${p.name} from lobby`}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PartyFinale({
  roomId,
  state,
  onResumeParty,
  onNewParty,
}: {
  roomId: string;
  state: RoomState;
  onResumeParty: () => void;
  onNewParty: () => void;
}) {
  const announcedRef = useRef(false);
  const standings = computeTeamStandings(state);
  const winners = getWinningStandings(standings);
  const podiumPlaces = [2, 1, 3] as const;

  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    speak(buildWinnerAnnouncement(standings), roomId);
  }, [standings, roomId]);

  return (
    <div
      data-testid="host-party-finale"
      data-total-score={state.teams.reduce((total, team) => total + team.score, 0)}
      className="agh-party-finale"
    >
      <div className="agh-party-finale-hero">
        <TapeReel label="MASTER · TONIGHT" />
        <div className="agh-party-finale-label">AI GAME HUB · LAST REEL</div>
        {winners.length === 1 ? (
          <>
            <h2>THE NIGHT, AS RECORDED.</h2>
            <div
              className={`agh-party-finale-winner ${teamColorClasses(winners[0]!.team.color).chip}`}
            >
              <span
                className={`size-4 rounded-full ${teamColorClasses(winners[0]!.team.color).bg}`}
              />
              <span>{winners[0]!.team.name}</span>
              <strong>{winners[0]!.team.score}</strong>
            </div>
          </>
        ) : (
          <>
            <h2>THE NIGHT ENDS IN A TIE.</h2>
            <div className="agh-party-finale-tie">
              {winners.map((standing) => {
                const c = teamColorClasses(standing.team.color);
                return (
                  <div key={standing.team.id} className={c.chip}>
                    <span className={`size-3 rounded-full ${c.bg}`} />
                    <span>{standing.team.name}</span>
                    <strong>{standing.team.score}</strong>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="agh-party-finale-meta">
          {state.players.length} {state.players.length === 1 ? "player" : "players"} ·{" "}
          {formatRussianPoints(winners[0]?.team.score ?? 0)} for the leaders
        </p>
      </div>

      <div className="agh-party-finale-body">
        <div className="agh-party-finale-section-label">Final signal</div>
        <div className="agh-party-podium">
          {podiumPlaces.map((place) => {
            const teams = standings.filter((standing) => standing.place === place);
            const height =
              place === 1 ? "h-36 sm:h-44" : place === 2 ? "h-28 sm:h-32" : "h-20 sm:h-24";
            const medal = String(place).padStart(2, "0");
            return (
              <div key={place} className="agh-party-podium-place">
                {teams.length > 0 ? (
                  teams.map((standing) => {
                    const c = teamColorClasses(standing.team.color);
                    return (
                      <div key={standing.team.id} className="w-full text-center">
                        <div className="agh-party-podium-rank">{medal}</div>
                        <div
                          className={`mt-1 rounded-xl border px-2 py-1 text-sm font-medium ${c.chip}`}
                        >
                          {standing.team.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {standing.team.score} · {standing.playerCount}{" "}
                          {standing.playerCount === 1
                            ? "player"
                            : standing.playerCount < 5
                              ? "players"
                              : "players"}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground">—</div>
                )}
                <div
                  className={`w-full rounded-t-2xl bg-gradient-to-t from-white/10 to-white/5 border border-white/10 ${height}`}
                />
                <div className="text-xs text-muted-foreground">{formatRussianPlace(place)}</div>
              </div>
            );
          })}
        </div>

        <div className="agh-party-standings">
          <div>Full standings</div>
          <div>
            {standings.map((standing) => {
              const c = teamColorClasses(standing.team.color);
              const isWinner = winners.some((winner) => winner.team.id === standing.team.id);
              return (
                <div key={standing.team.id} className={`${c.chip} ${isWinner ? "is-winner" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-display text-xl tabular-nums opacity-70 w-8 shrink-0">
                      {standing.place}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{standing.team.name}</div>
                      <div className="text-[10px] uppercase tracking-wide opacity-70">
                        {standing.playerCount}{" "}
                        {standing.playerCount === 1
                          ? "player"
                          : standing.playerCount < 5
                            ? "players"
                            : "players"}
                      </div>
                    </div>
                  </div>
                  <div className="font-display text-2xl tabular-nums shrink-0">
                    {standing.team.score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <PartyFinaleNarrative roomId={roomId} state={state} canGenerate />

        <PartyFinaleLedger roomId={roomId} state={state} />

        <div className="agh-party-finale-actions">
          <button type="button" onClick={onResumeParty} className="is-primary">
            One more game
          </button>
          <button type="button" onClick={onNewParty} className="is-secondary">
            New party
          </button>
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center text-white/80 px-6 park-gradient">
      {children}
    </div>
  );
}

// reference to satisfy TS unused-import check (broadcast used inside HostView later)
void useBroadcast;
void supabase;
