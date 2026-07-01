import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRoom, useBroadcast, updateRoomState, getHostSecret, genId } from "@/lib/room";
import { supabase } from "@/integrations/supabase/client";
import { SoundscapeHost } from "@/games/soundscape/HostView";
import { ChallengeHost } from "@/games/challenge/HostView";
import { PhotoHuntHost } from "@/games/phototunt/HostView";
import { teamColorClasses } from "@/lib/team-style";

export const Route = createFileRoute("/host/$code")({
  component: HostPage,
});

function HostPage() {
  const { code } = Route.useParams();
  const { room, loading, error } = useRoom(code);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    setIsHost(!!getHostSecret(code));
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

  return <HostInner roomId={room.id} code={room.code} state={room.state} />;
}

function HostInner({
  roomId,
  code,
  state,
}: {
  roomId: string;
  code: string;
  state: import("@/lib/types").RoomState;
}) {
  const update = (patch: Partial<import("@/lib/types").RoomState>) =>
    updateRoomState(roomId, { ...state, ...patch });

  const { send } = useBroadcast(roomId);

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

  async function launchSoundscape() {
    const roundId = genId("snd");
    await updateRoomState(roomId, {
      ...state,
      status: "playing",
      currentGame: "soundscape",
      soundscape: { phase: "topics", roundId },
    });
  }

  async function launchChallenge() {
    if (state.players.length < 2) return;
    const operator = state.players[Math.floor(Math.random() * state.players.length)];
    await updateRoomState(roomId, {
      ...state,
      status: "playing",
      currentGame: "challenge",
      challenge: {
        phase: "briefing",
        roundId: genId("ch"),
        operatorId: operator.id,
        operatorName: operator.name,
        pastOperatorIds: [],
      },
    });
  }

  async function launchPhotoHunt() {
    if (state.players.length < 1) return;
    await updateRoomState(roomId, {
      ...state,
      status: "playing",
      currentGame: "phototunt",
      phototunt: {
        phase: "briefing",
        roundId: genId("ph"),
        pastTasks: [],
      },
    });
  }

  async function resetGame() {
    await updateRoomState(roomId, {
      ...state,
      status: "lobby",
      currentGame: null,
      soundscape: undefined,
      challenge: undefined,
      phototunt: undefined,
    });
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="park-gradient">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">Ведущий</div>
            <h1 className="font-display text-2xl sm:text-3xl text-white">DIMAS fest</h1>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/70">Код</div>
            <div className="font-display text-3xl sm:text-5xl text-white tracking-[0.2em] tabular-num">
              {code}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <section>
          {state.currentGame === "soundscape" && state.soundscape ? (
            <SoundscapeHost roomId={roomId} code={code} state={state} />
          ) : state.currentGame === "challenge" && state.challenge ? (
            <ChallengeHost roomId={roomId} state={state} />
          ) : state.currentGame === "phototunt" && state.phototunt ? (
            <PhotoHuntHost roomId={roomId} state={state} />
          ) : (
            <Lobby
              totalPlayers={totalPlayers}
              code={code}
              joinUrl={joinUrl}
              onLaunchSoundscape={launchSoundscape}
              onLaunchChallenge={launchChallenge}
              onLaunchPhotoHunt={launchPhotoHunt}
              speakerUrlFor={speakerUrlFor}
              onTestSpeaker={testSpeaker}
              state={state}
            />
          )}
        </section>

        <aside className="space-y-4">
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

function Lobby({
  totalPlayers,
  code,
  joinUrl,
  onLaunchSoundscape,
  onLaunchChallenge,
  onLaunchPhotoHunt,
  speakerUrlFor,
  onTestSpeaker,
  state,
}: {
  totalPlayers: number;
  code: string;
  joinUrl: string;
  onLaunchSoundscape: () => void;
  onLaunchChallenge: () => void;
  onLaunchPhotoHunt: () => void;
  speakerUrlFor: (n: number) => string;
  onTestSpeaker: (n: number) => void;
  state: import("@/lib/types").RoomState;
}) {
  const [copied, setCopied] = useState(false);
  const [mainTested, setMainTested] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasSkipped, setExtrasSkipped] = useState(false);

  function copyLink() {
    navigator.clipboard?.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "DIMAS fest",
          text: `Заходи в парк, код ${code}`,
          url: joinUrl,
        });
      } catch {
        // Native share was cancelled or unavailable after opening.
      }
    } else copyLink();
  }
  function testMain() {
    onTestSpeaker(1);
    setMainTested(true);
  }

  const extrasConnected = [2, 3, 4, 5].filter((s) => state.speakerSlots?.[s]?.connected).length;
  const step1Done = mainTested;
  const step2Done = totalPlayers > 0;
  const step3Done = extrasConnected > 0 || extrasSkipped;
  const canLaunch = step1Done && step2Done;

  return (
    <div className="space-y-4">
      {/* STEP 1 — главная колонка */}
      <Step
        n={1}
        done={step1Done}
        title="Подключи главную колонку"
        subtitle="Bluetooth-колонка к этому телефону"
      >
        <p className="text-sm text-muted-foreground">
          Открой настройки Bluetooth на этом телефоне, найди колонку, выкрути громкость на максимум.
          Потом проверь — должно сказать «главная колонка на связи».
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={testMain}
            className="rounded-full bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] text-sm font-medium px-4 py-2"
          >
            🔊 {mainTested ? "Ещё раз" : "Проверить колонку"}
          </button>
          {!mainTested && (
            <button
              onClick={() => setMainTested(true)}
              className="rounded-full bg-white/5 text-white/70 text-sm px-4 py-2"
            >
              Пропустить (играю без колонки)
            </button>
          )}
        </div>
      </Step>

      {/* STEP 2 — игроки */}
      <Step
        n={2}
        done={step2Done}
        title="Позови друзей"
        subtitle={step2Done ? `${totalPlayers} в комнате` : "Они сканируют QR"}
      >
        <div className="rounded-2xl bg-white p-4 text-center">
          <div className="inline-block rounded-xl bg-white p-2 ring-1 ring-black/10">
            <QRCodeSVG value={joinUrl} size={220} level="M" includeMargin={false} />
          </div>
          <div className="mt-2 font-display text-3xl tracking-[0.25em] tabular-num text-black">
            {code}
          </div>
          <div className="mt-0.5 text-[11px] text-black/50 break-all">
            {joinUrl.replace(/^https?:\/\//, "")}
          </div>
          <div className="mt-3 flex gap-2 justify-center">
            <button
              onClick={share}
              className="rounded-full bg-black text-white text-xs px-3 py-1.5"
            >
              Поделиться
            </button>
            <button
              onClick={copyLink}
              className="rounded-full bg-black/5 text-black text-xs px-3 py-1.5"
            >
              {copied ? "✓" : "Копировать"}
            </button>
          </div>
        </div>
      </Step>

      {/* STEP 3 — духи парка (опционально) */}
      <Step
        n={3}
        done={step3Done}
        optional
        title="Духи парка"
        subtitle={extrasConnected > 0 ? `${extrasConnected} доп. колонок` : "Можно пропустить"}
      >
        <p className="text-sm text-muted-foreground">
          Хочешь объёмный звук? Возьми ещё телефоны, открой на каждом ссылку ниже — они станут
          отдельными «голосами» парка. Подключи к ним Bluetooth-колонки и расставь у деревьев.
        </p>
        {!extrasOpen && !extrasSkipped && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setExtrasOpen(true)}
              className="rounded-full bg-white/10 hover:bg-white/15 text-white text-sm px-4 py-2"
            >
              Показать ссылки
            </button>
            <button
              onClick={() => setExtrasSkipped(true)}
              className="rounded-full bg-white/5 text-white/70 text-sm px-4 py-2"
            >
              Пропустить
            </button>
          </div>
        )}
        {(extrasOpen || extrasConnected > 0) && (
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            {[2, 3, 4, 5].map((slot) => (
              <SpeakerSetupRow
                key={slot}
                slot={slot}
                url={speakerUrlFor(slot)}
                state={state}
                onTest={() => onTestSpeaker(slot)}
              />
            ))}
          </div>
        )}
      </Step>

      {/* STEP 4 — выбор игры */}
      <div className={`rounded-3xl park-gradient p-6 text-white ${canLaunch ? "" : "opacity-70"}`}>
        <div className="flex items-center gap-3">
          <span className="size-7 grid place-items-center rounded-full bg-white/15 font-display text-sm">
            4
          </span>
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/80">Выбери игру</div>
            <h3 className="font-display text-2xl mt-0.5">Что играем первым?</h3>
          </div>
        </div>

        {!canLaunch && (
          <p className="mt-3 text-white/80 text-sm">
            {!step2Done ? "Сначала позови хотя бы одного игрока." : "Проверь колонку выше."}
          </p>
        )}

        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <GameCard
            emoji="🎚️"
            title="Звуковой баттл"
            time="~7 минут"
            desc="Команды ловят звуки парка, AI собирает 60-сек спатиальный микс между колонками."
            disabled={!canLaunch}
            onClick={onLaunchSoundscape}
          />
          <GameCard
            emoji="🎬"
            title="Челлендж духа парка"
            time="~3 минуты на раунд"
            desc="Один снимает на телефон, остальные играют сценку по заданию AI. Судья ставит 1-10."
            disabled={!canLaunch || totalPlayers < 2}
            disabledHint={totalPlayers < 2 ? "нужно ≥ 2 игроков" : undefined}
            onClick={onLaunchChallenge}
          />
          <GameCard
            emoji="📸"
            title="Фотоохота"
            time="~2 минуты на раунд"
            desc="AI даёт абсурдное фото-задание. У всех 60 сек снять ОДИН кадр. AI ранжирует и язвит."
            disabled={!canLaunch}
            onClick={onLaunchPhotoHunt}
          />
        </div>
      </div>
    </div>
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

function Step({
  n,
  done,
  optional,
  title,
  subtitle,
  children,
}: {
  n: number;
  done: boolean;
  optional?: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border p-5 transition ${done ? "bg-card/60 border-[var(--color-park-bright)]/30" : "bg-card border-border"}`}
    >
      <header className="flex items-start gap-3">
        <span
          className={`shrink-0 size-8 grid place-items-center rounded-full font-display text-sm ${done ? "bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)]" : "bg-white/10 text-white"}`}
        >
          {done ? "✓" : n}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg">{title}</h3>
            {optional && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground rounded-full bg-white/5 px-2 py-0.5">
                опционально
              </span>
            )}
          </div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </header>
      <div className="mt-3 pl-11">{children}</div>
    </section>
  );
}

function SpeakerSetupRow({
  slot,
  url,
  state,
  onTest,
}: {
  slot: number;
  url: string;
  state: import("@/lib/types").RoomState;
  onTest: () => void;
}) {
  const sp = state.speakerSlots?.[slot];
  const isMain = slot === 1;
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="rounded-2xl bg-background/40 border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            Колонка {slot} · {sp?.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {isMain ? "Это устройство ведущего" : "Открой ссылку на другом телефоне"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(isMain || sp?.connected) && (
            <button
              onClick={onTest}
              className="text-xs rounded-full bg-white/10 hover:bg-white/20 px-2.5 py-1"
            >
              🔊 тест
            </button>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${sp?.connected ? "bg-[var(--color-park-bright)]/20 text-[var(--color-park-bright)]" : "bg-white/5 text-white/40"}`}
          >
            {sp?.connected ? "готова" : "офлайн"}
          </span>
        </div>
      </div>
      {!isMain && (
        <button
          onClick={copy}
          className="mt-2 w-full rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-left font-mono truncate"
        >
          {copied ? "✓ скопировано" : url}
        </button>
      )}
    </div>
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

// reference to satisfy TS unused-import check (broadcast used inside HostView later)
void useBroadcast;
void supabase;
