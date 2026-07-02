import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DirectorPanel } from "@/components/DirectorPanel";
import { useRoom, useBroadcast, getHostSecret } from "@/lib/room";
import { eventProfile } from "@/lib/event-profile";
import { teamColorClasses } from "@/lib/team-style";
import { canSkipCurrentPhase } from "@/lib/host-controls";
import { speakerReadiness } from "@/lib/speaker-status";
import { MAX_TEAMS, playersOnTeam, suggestTeamName } from "@/lib/teams";
import type { GameId, RoomState } from "@/lib/types";

const SoundscapeHost = lazy(() =>
  import("@/games/soundscape/HostView").then((module) => ({
    default: module.SoundscapeHost,
  })),
);
const ChallengeHost = lazy(() =>
  import("@/games/challenge/HostView").then((module) => ({
    default: module.ChallengeHost,
  })),
);
const PhotoHuntHost = lazy(() =>
  import("@/games/phototunt/HostView").then((module) => ({
    default: module.PhotoHuntHost,
  })),
);
const TrackGuessHost = lazy(() =>
  import("@/games/trackguess/HostView").then((module) => ({
    default: module.TrackGuessHost,
  })),
);
const SpectrumCourtHost = lazy(() =>
  import("@/games/spectrumcourt/HostView").then((module) => ({
    default: module.SpectrumCourtHost,
  })),
);

export const Route = createFileRoute("/host/$code")({
  component: HostPage,
});

function HostPage() {
  const { code } = Route.useParams();
  const { room, loading, error, setRoom } = useRoom(code);
  const [isHost, setIsHost] = useState(false);
  const [hostSecret, setHostSecret] = useState<string | null>(null);

  useEffect(() => {
    const secret = getHostSecret(code);
    setHostSecret(secret);
    setIsHost(!!secret);
  }, [code]);

  if (loading) return <Center>Загружаем комнату…</Center>;
  if (error || !room)
    return (
      <Center>
        Комната не найдена.{" "}
        <Link to="/" className="underline ml-2">
          На главную
        </Link>
      </Center>
    );
  if (!isHost)
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="text-white/70">Ты открыл эту комнату как гость.</div>
          <p className="mt-2 text-sm text-white/50">
            Если ты ведущий — открой ссылку с того устройства, где создавал комнату.
          </p>
          <Link
            to="/play/$code"
            params={{ code }}
            className="inline-block mt-5 rounded-2xl bg-[var(--color-park-bright)] px-5 py-3 text-[oklch(0.18_0.05_160)] font-medium"
          >
            Зайти как игрок →
          </Link>
        </div>
      </Center>
    );

  return (
    <HostInner
      roomId={room.id}
      code={room.code}
      state={room.state}
      hostSecret={hostSecret}
      onState={(state) => setRoom({ ...room, state })}
    />
  );
}

function HostInner({
  roomId,
  code,
  state,
  hostSecret,
  onState,
}: {
  roomId: string;
  code: string;
  state: RoomState;
  hostSecret: string | null;
  onState: (state: RoomState) => void;
}) {
  const { send } = useBroadcast(roomId);
  const [hostControlError, setHostControlError] = useState<string | null>(null);

  const totalPlayers = state.players.length;
  const joinUrl =
    typeof window !== "undefined" ? `${window.location.origin}/play/${code}` : `/play/${code}`;
  const speakerUrlFor = (slot: number) =>
    typeof window !== "undefined" ? `${window.location.origin}/speaker/${code}?slot=${slot}` : "";

  function testSpeaker(slot: number) {
    if (slot === 1) {
      // host laptop = slot 1: play locally
      const a = new Audio(`/api/speak?text=${encodeURIComponent("Главная колонка на связи.")}`);
      a.play().catch(() => {});
    } else {
      send({ type: "test-tone", slot });
    }
  }

  async function callHostControl(payload: {
    action: string;
    gameId?: GameId;
    teamId?: string;
    name?: string;
  }) {
    if (!hostSecret) {
      setHostControlError("Host authorization is missing on this device.");
      return;
    }
    setHostControlError(null);
    try {
      const response = await fetch("/api/host-control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-host-secret": hostSecret,
        },
        body: JSON.stringify({ code, ...payload }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as { state: RoomState };
      onState(data.state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Host control failed";
      console.error("[host-control]", error);
      setHostControlError(message);
    }
  }

  async function launchSoundscape() {
    await callHostControl({ action: "launch-game", gameId: "soundscape" });
  }

  async function launchChallenge() {
    await callHostControl({ action: "launch-game", gameId: "challenge" });
  }

  async function launchPhotoHunt() {
    await callHostControl({ action: "launch-game", gameId: "phototunt" });
  }

  async function launchTrackGuess() {
    await callHostControl({ action: "launch-game", gameId: "trackguess" });
  }

  async function launchSpectrumCourt() {
    await callHostControl({ action: "launch-game", gameId: "spectrumcourt" });
  }

  async function resetGame() {
    await callHostControl({ action: "force-back-to-hub" });
  }

  async function togglePause() {
    await callHostControl({ action: "pause-toggle" });
  }

  async function skipPhase() {
    await callHostControl({ action: "skip-phase" });
  }

  async function restartCurrentGame() {
    await callHostControl({ action: "restart-game" });
  }

  async function forceBackToHub() {
    await callHostControl({ action: "force-back-to-hub" });
  }

  async function addTeam(name: string) {
    await callHostControl({ action: "add-team", name });
  }

  async function renameTeam(teamId: string, name: string) {
    await callHostControl({ action: "rename-team", teamId, name });
  }

  async function removeTeam(teamId: string) {
    await callHostControl({ action: "remove-team", teamId });
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="park-gradient">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">Ведущий</div>
            <h1 className="font-display text-2xl sm:text-3xl text-white">{eventProfile.title}</h1>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/70">Код</div>
            <div className="font-display text-3xl sm:text-5xl text-white tracking-[0.2em] tabular-num">
              {code}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <section>
          {state.currentGame && (
            <HostControlBar
              state={state}
              canSkip={canSkipCurrentPhase(state)}
              onTogglePause={togglePause}
              onSkip={skipPhase}
              onRestart={restartCurrentGame}
              onBackToHub={forceBackToHub}
            />
          )}

          {hostControlError && (
            <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {hostControlError}
            </div>
          )}

          {state.currentGame ? (
            <Suspense fallback={<HostGameLoading />}>
              {state.currentGame === "soundscape" && state.soundscape ? (
                <SoundscapeHost
                  roomId={roomId}
                  code={code}
                  hostSecret={hostSecret ?? ""}
                  state={state}
                />
              ) : state.currentGame === "challenge" && state.challenge ? (
                <ChallengeHost
                  roomId={roomId}
                  code={code}
                  hostSecret={hostSecret ?? ""}
                  state={state}
                />
              ) : state.currentGame === "phototunt" && state.phototunt ? (
                <PhotoHuntHost
                  roomId={roomId}
                  code={code}
                  hostSecret={hostSecret ?? ""}
                  state={state}
                />
              ) : state.currentGame === "trackguess" && state.trackguess ? (
                <TrackGuessHost code={code} hostSecret={hostSecret ?? ""} state={state} />
              ) : state.currentGame === "spectrumcourt" && state.spectrumcourt ? (
                <SpectrumCourtHost code={code} hostSecret={hostSecret ?? ""} state={state} />
              ) : (
                <HostGameLoading />
              )}
            </Suspense>
          ) : (
            <Lobby
              totalPlayers={totalPlayers}
              code={code}
              joinUrl={joinUrl}
              onLaunchSoundscape={launchSoundscape}
              onLaunchChallenge={launchChallenge}
              onLaunchPhotoHunt={launchPhotoHunt}
              onLaunchTrackGuess={launchTrackGuess}
              onLaunchSpectrumCourt={launchSpectrumCourt}
              speakerUrlFor={speakerUrlFor}
              onTestSpeaker={testSpeaker}
              onAddTeam={addTeam}
              onRenameTeam={renameTeam}
              onRemoveTeam={removeTeam}
              state={state}
            />
          )}
        </section>

        <aside className="space-y-4">
          <DirectorPanel code={code} hostSecret={hostSecret} state={state} onState={onState} />
          <Scoreboard state={state} />
          <PlayersList state={state} />
          <button
            onClick={resetGame}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-2 text-xs text-white/60 hover:text-white"
          >
            ↺ Сбросить в лобби
          </button>
        </aside>
      </div>
    </main>
  );
}

function HostGameLoading() {
  return (
    <div className="rounded-3xl border border-white/10 bg-card p-8 text-center">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Игра</div>
      <div className="font-display mt-2 text-3xl">Готовим экран раунда…</div>
    </div>
  );
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
  const gameLabel = {
    soundscape: "Звуковой баттл",
    challenge: "Челлендж",
    phototunt: "Фотоохота",
    trackguess: "Настоящий или AI?",
    spectrumcourt: "Spectrum Court",
  }[state.currentGame ?? "soundscape"];
  const phase =
    state.currentGame === "soundscape"
      ? state.soundscape?.phase
      : state.currentGame === "challenge"
        ? state.challenge?.phase
        : state.currentGame === "phototunt"
          ? state.phototunt?.phase
          : state.currentGame === "trackguess"
            ? state.trackguess?.phase
            : state.currentGame === "spectrumcourt"
              ? state.spectrumcourt?.phase
              : null;

  return (
    <div className="mb-4 rounded-3xl border border-white/10 bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Управление раундом
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-display text-xl">{gameLabel}</span>
            {phase && (
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                {phase}
              </span>
            )}
            {state.paused && (
              <span className="rounded-full bg-[var(--color-park-bright)]/20 px-2.5 py-1 text-xs text-[var(--color-park-bright)]">
                пауза
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            onClick={onTogglePause}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
          >
            {state.paused ? "Продолжить" : "Пауза"}
          </button>
          <button
            onClick={onSkip}
            disabled={!canSkip}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Пропустить фазу
          </button>
          <button
            onClick={onRestart}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
          >
            Заново
          </button>
          <button
            onClick={onBackToHub}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 hover:text-white"
          >
            В hub
          </button>
        </div>
      </div>
    </div>
  );
}

function Lobby({
  totalPlayers,
  code,
  joinUrl,
  onLaunchSoundscape,
  onLaunchChallenge,
  onLaunchPhotoHunt,
  onLaunchTrackGuess,
  onLaunchSpectrumCourt,
  speakerUrlFor,
  onTestSpeaker,
  onAddTeam,
  onRenameTeam,
  onRemoveTeam,
  state,
}: {
  totalPlayers: number;
  code: string;
  joinUrl: string;
  onLaunchSoundscape: () => void;
  onLaunchChallenge: () => void;
  onLaunchPhotoHunt: () => void;
  onLaunchTrackGuess: () => void;
  onLaunchSpectrumCourt: () => void;
  speakerUrlFor: (n: number) => string;
  onTestSpeaker: (n: number) => void;
  onAddTeam: (name: string) => Promise<void>;
  onRenameTeam: (teamId: string, name: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
  state: import("@/lib/types").RoomState;
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
        speakerUrlFor={speakerUrlFor}
        state={state}
        totalPlayers={totalPlayers}
        extrasConnected={extrasConnected}
        onClose={() => setFullscreenQr(false)}
        onTestSpeaker={onTestSpeaker}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card/40 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{totalPlayers}</span> игроков ·{" "}
          <span className="text-foreground font-medium">{extrasConnected}</span> доп. колонок
        </div>
        <button
          type="button"
          onClick={() => setFullscreenQr(true)}
          className="rounded-full bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] text-sm font-medium px-4 py-2"
        >
          QR на весь экран
        </button>
      </div>

      <TeamManager
        state={state}
        onAddTeam={onAddTeam}
        onRenameTeam={onRenameTeam}
        onRemoveTeam={onRemoveTeam}
      />

      <section className="rounded-3xl border bg-card border-border p-5">
        <header className="mb-3">
          <h3 className="font-display text-xl">Игроки</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Сканируют QR — попадают в лобби</p>
        </header>
        <div className="rounded-2xl bg-white p-4 text-center">
          <div className="inline-block rounded-xl bg-white p-2 ring-1 ring-black/10">
            <QRCodeSVG value={joinUrl} size={220} level="M" includeMargin={false} />
          </div>
          <div className="mt-2 font-display text-3xl tracking-[0.25em] tabular-nums text-black">
            {code}
          </div>
          <div className="mt-3 flex gap-2 justify-center">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full bg-black/5 text-black text-xs px-3 py-1.5"
            >
              {copied ? "✓ скопировано" : "Копировать ссылку"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-card border-border p-5">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-xl">Главная колонка</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bluetooth к этому телефону · опционально для Challenge и Photo Hunt
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTestSpeaker(1)}
            className="rounded-full bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] text-sm font-medium px-4 py-2"
          >
            🔊 Проверить звук
          </button>
        </header>
      </section>

      <section className="rounded-3xl border bg-card border-border p-5">
        <header className="mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-xl">Духи парка</h3>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground rounded-full bg-white/5 px-2 py-0.5">
              опционально · Soundscape
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Старый телефон + Bluetooth-колонка — сканирует QR и становится «голосом» парка
          </p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </section>

      <div className={`rounded-3xl park-gradient p-6 text-white ${hasPlayers ? "" : "opacity-70"}`}>
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/80">Старт</div>
          <h3 className="font-display text-2xl mt-0.5">Что играем первым?</h3>
        </div>

        {!hasPlayers && (
          <p className="mt-3 text-white/80 text-sm">
            Сначала пусть хотя бы один друг отсканирует QR.
          </p>
        )}

        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <GameCard
            emoji="🎚️"
            title="Звуковой баттл"
            time="~7 минут"
            desc="Команды ловят звуки парка, AI собирает 60-сек микс между колонками."
            disabled={!canSoundscape}
            disabledHint={
              !canSoundscape
                ? "нужен ≥ 1 игрок"
                : extrasConnected === 0
                  ? "можно без доп. колонок"
                  : undefined
            }
            onClick={onLaunchSoundscape}
          />
          <GameCard
            emoji="🎬"
            title="Челлендж духа парка"
            time="~3 минуты на раунд"
            desc="Один снимает на телефон, остальные играют сценку. AI судит 1–10."
            disabled={!canChallenge}
            disabledHint={!canChallenge ? "нужно ≥ 2 игроков" : undefined}
            onClick={onLaunchChallenge}
          />
          <GameCard
            emoji="📸"
            title="Фотоохота"
            time="~2 минуты на раунд"
            desc="AI даёт абсурдное задание. У всех 60 сек на один кадр."
            disabled={!canPhoto}
            disabledHint={!canPhoto ? "нужен ≥ 1 игрок" : undefined}
            onClick={onLaunchPhotoHunt}
          />
          <GameCard
            emoji="🎧"
            title="Настоящий или AI?"
            time="~5 раундов"
            desc="Слушаете трек и угадываете: живой или сгенерированный нейросетью."
            disabled={!canTrackGuess}
            disabledHint={!canTrackGuess ? "нужен ≥ 1 игрок" : undefined}
            onClick={onLaunchTrackGuess}
          />
          <GameCard
            emoji="⚖️"
            title="Spectrum Court"
            time="~4 раунда"
            desc="Одна команда даёт подсказку к скрытой точке на шкале, остальные спорят и ставят маркер."
            disabled={!canSpectrumCourt}
            disabledHint={!canSpectrumCourt ? "нужно ≥ 2 активных команд" : undefined}
            onClick={onLaunchSpectrumCourt}
          />
        </div>
      </div>
    </div>
  );
}

function SetupFullscreen({
  code,
  joinUrl,
  speakerUrlFor,
  state,
  totalPlayers,
  extrasConnected,
  onClose,
  onTestSpeaker,
}: {
  code: string;
  joinUrl: string;
  speakerUrlFor: (n: number) => string;
  state: import("@/lib/types").RoomState;
  totalPlayers: number;
  extrasConnected: number;
  onClose: () => void;
  onTestSpeaker: (n: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 park-gradient overflow-auto">
      <div className="min-h-dvh px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
                {eventProfile.title}
              </div>
              <h2 className="font-display text-4xl sm:text-5xl text-white mt-1 tracking-[0.2em]">
                {code}
              </h2>
              <p className="text-sm text-white/70 mt-2">
                {totalPlayers} игроков · {extrasConnected} доп. колонок онлайн
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 hover:bg-white/15 text-white text-sm px-4 py-2"
            >
              Закрыть
            </button>
          </div>

          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
            <section className="rounded-3xl bg-white p-6 text-center">
              <div className="text-xs uppercase tracking-widest text-black/50 mb-3">Игроки</div>
              <QRCodeSVG value={joinUrl} size={280} level="M" includeMargin={false} />
              <p className="mt-4 text-sm text-black/60">
                Сканируй камерой — имя и команда на телефоне
              </p>
            </section>

            <section className="rounded-3xl bg-black/35 border border-white/10 p-5">
              <div className="text-xs uppercase tracking-widest text-white/60 mb-4 text-center">
                Колонки · опционально
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[2, 3, 4, 5].map((slot) => (
                  <SpeakerQrCard
                    key={slot}
                    slot={slot}
                    url={speakerUrlFor(slot)}
                    state={state}
                    onTest={() => onTestSpeaker(slot)}
                    compact
                  />
                ))}
              </div>
              <p className="text-xs text-white/50 text-center mt-4">
                Bluetooth-колонка → сканируй QR → одна кнопка «Включить»
              </p>
            </section>
          </div>
        </div>
      </div>
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
        <QRCodeSVG value={url} size={compact ? 88 : 100} level="M" includeMargin={false} />
      </div>
      <div className={`mt-2 text-xs font-medium truncate ${compact ? "text-black" : ""}`}>
        {sp?.name ?? `Колонка ${slot}`}
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
            🔊 тест
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-card border-border p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl">Команды</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Игроки выбирают команду на телефоне — названия обновляются сразу
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
                  if (next && next !== t.name) void onRenameTeam(t.id, next);
                }}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              />
              <span className="hidden sm:inline text-[10px] uppercase tracking-wide opacity-70 shrink-0">
                {members.length === 0
                  ? "пусто"
                  : `${members.length} ${members.length === 1 ? "игрок" : members.length < 5 ? "игрока" : "игроков"}`}
              </span>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => void onRemoveTeam(t.id)}
                  className="shrink-0 rounded-full bg-black/10 hover:bg-black/20 size-7 text-sm"
                  aria-label={`Удалить ${t.name}`}
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
            + Добавить
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Максимум {MAX_TEAMS} команд.</p>
      )}

      {canAdd && (
        <div className="mt-3 flex flex-wrap gap-2">
          {["Лисы", "Ежи", "Сова", "Волки"].map((preset) => (
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
            + Быстрая команда
          </button>
        </div>
      )}
    </section>
  );
}

function GameCard({
  emoji,
  title,
  time,
  desc,
  disabled,
  disabledHint,
  onClick,
}: {
  emoji: string;
  title: string;
  time: string;
  desc: string;
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/15 p-4 disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-3xl">{emoji}</div>
        <div className="text-[10px] uppercase tracking-widest text-white/60">{time}</div>
      </div>
      <div className="font-display text-xl mt-2">{title}</div>
      <p className="text-sm text-white/75 mt-1">{desc}</p>
      {disabled && disabledHint && <div className="mt-2 text-xs text-white/55">{disabledHint}</div>}
    </button>
  );
}

function Scoreboard({ state }: { state: import("@/lib/types").RoomState }) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  return (
    <div className="rounded-3xl bg-card p-4 border">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Счёт</div>
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
                  {count} {count === 1 ? "игрок" : count < 5 ? "игрока" : "игроков"}
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

function PlayersList({ state }: { state: import("@/lib/types").RoomState }) {
  return (
    <div className="rounded-3xl bg-card p-4 border">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Игроки ({state.players.length})
      </div>
      <div className="space-y-1 max-h-64 overflow-auto pr-1">
        {state.players.length === 0 && (
          <div className="text-xs text-muted-foreground">Пока никого. Покажи код друзьям.</div>
        )}

        {state.players.map((p) => {
          const team = state.teams.find((t) => t.id === p.teamId);
          const c = team ? teamColorClasses(team.color) : null;
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className={`size-2 rounded-full ${c?.bg ?? "bg-white/30"}`} />
              <span>{p.name}</span>
              <span className="text-muted-foreground text-xs ml-auto">{team?.name}</span>
            </div>
          );
        })}
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
