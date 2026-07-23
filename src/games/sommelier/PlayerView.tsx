import { useEffect, useState } from "react";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { PhotoCapture } from "@/components/photo-capture";
import { downscaleImage } from "@/lib/image-client";
import { friendlyUploadError } from "@/lib/media-errors";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import type { StoredPlayer } from "@/lib/player-action-client";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import {
  sommelierPlayerStatusClient,
  submitSommelierGuessClient,
  submitSommelierPhotoClient,
} from "@/lib/sommelier-client";
import { formatClock } from "@/lib/team-style";
import type { RoomState } from "@/lib/types";

export function SommelierPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const sommelier = state.sommelier!;
  const locale = state.party?.uiLocale ?? "en";
  const selected = sommelier.participantIds.includes(me.id);
  const submitted = sommelier.submittedPlayerIds.includes(me.id);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoSubmittedLocal, setPhotoSubmittedLocal] = useState(false);
  const [ballotSubmittedLocal, setBallotSubmittedLocal] = useState(false);
  const [privateStatus, setPrivateStatus] = useState<{
    isOwner: boolean;
    hasSubmittedBallot: boolean;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setBusy(false);
    setError(null);
    setPhotoSubmittedLocal(false);
  }, [sommelier.sessionId]);

  useEffect(() => {
    setPrivateStatus(null);
    setBallotSubmittedLocal(false);
    setError(null);
    if (!sommelier.currentEntryId || !["voting", "reveal"].includes(sommelier.phase)) return;
    let cancelled = false;
    void sommelierPlayerStatusClient(roomId, sommelier.sessionId, me.id)
      .then((status) => {
        if (!cancelled) setPrivateStatus(status);
      })
      .catch((statusError) => {
        if (!cancelled) setError(friendlyPlayerActionError(statusError, "drink status", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [me.id, roomId, sommelier.currentEntryId, sommelier.phase, sommelier.sessionId]);

  async function capture(file: File) {
    setBusy(true);
    setError(null);
    try {
      const image = await downscaleImage(file, 1024, 0.82);
      const storagePath = await uploadPlayerMedia(
        roomId,
        {
          action: "sommelier-photo",
          playerId: me.id,
          roundId: sommelier.sessionId,
          mimeType: "image/jpeg",
        },
        image.blob,
      );
      await submitSommelierPhotoClient({
        roomId,
        sessionId: sommelier.sessionId,
        playerId: me.id,
        storagePath,
      });
      setPhotoSubmittedLocal(true);
    } catch (captureError) {
      setError(friendlyUploadError(captureError, "photo"));
    } finally {
      setBusy(false);
    }
  }

  async function guess(guessedOwnerPlayerId: string) {
    if (!sommelier.currentEntryId) return;
    setBusy(true);
    setError(null);
    try {
      await submitSommelierGuessClient({
        roomId,
        sessionId: sommelier.sessionId,
        entryId: sommelier.currentEntryId,
        playerId: me.id,
        guessedOwnerPlayerId,
      });
      setBallotSubmittedLocal(true);
    } catch (guessError) {
      setError(friendlyPlayerActionError(guessError, "Sommelier ballot"));
    } finally {
      setBusy(false);
    }
  }

  const timerEnd = sommelier.phase === "capture" ? sommelier.captureEndsAt : sommelier.votingEndsAt;
  const remaining = Math.max(0, (timerEnd ?? now) - now);

  if (sommelier.phase === "capture") {
    return (
      <SommelierCard>
        <div className="flex items-center justify-between gap-3">
          <Pill>{locale === "ru" ? "Анонимный сбор" : "Anonymous collection"}</Pill>
          <span className="font-display text-xl tabular-nums text-fuchsia-100">
            {formatClock(remaining)}
          </span>
        </div>
        <h2 className="mt-3 font-display text-3xl">
          {selected
            ? locale === "ru"
              ? "Сними свой напиток. Только напиток."
              : "Photograph your drink. Only the drink."
            : locale === "ru"
              ? "Ты — будущий подозреваемый"
              : "You are a future suspect"}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-white/65">
          {selected
            ? locale === "ru"
              ? "Подойдёт вода, кофе, пиво или коктейль — пить ничего не требуется. Убери из кадра лица, имена, часы и очевидные личные вещи. Оставь бокал, свет и бар."
              : "Water, coffee, beer or a cocktail all work—nobody has to drink. Keep faces, names, watches and obvious personal items out. Leave the vessel, light and bar."
            : locale === "ru"
              ? "Другие снимают бокалы. Скоро AI опишет владельца, а ты будешь показывать пальцем на друзей с научной уверенностью."
              : "Others are photographing glasses. Soon AI will profile an owner and you will point at friends with scientific confidence."}
        </p>
        {selected && (
          <div className="mt-6">
            {submitted || photoSubmittedLocal ? (
              <div className="rounded-2xl border border-emerald-100/15 bg-emerald-300/10 p-5 text-sm text-emerald-50/75">
                {locale === "ru"
                  ? "Фото опечатано. Не рассказывай, какой бокал твой."
                  : "Photo sealed. Do not announce which glass is yours."}
              </div>
            ) : (
              <PhotoCapture
                disabled={busy || remaining <= 0}
                onCapture={(file) => void capture(file)}
                captureLabel={
                  busy
                    ? locale === "ru"
                      ? "Опечатываем бокал…"
                      : "Sealing glass…"
                    : locale === "ru"
                      ? "📸 Снять напиток анонимно"
                      : "📸 Photograph drink anonymously"
                }
                retakeLabel={locale === "ru" ? "↻ Переснять и отправить" : "↻ Retake and submit"}
                buttonClassName="bg-fuchsia-100 text-stone-950"
              />
            )}
          </div>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <GameRulesChecklist gameId="sommelier" />
      </SommelierCard>
    );
  }

  if (sommelier.phase === "analyzing") {
    return (
      <Waiting
        title={locale === "ru" ? "Сомелье купил диплом" : "Sommelier bought a diploma"}
        body={
          locale === "ru"
            ? "Теперь он изучает бокалы, не зная владельцев. Это редкий момент методологической честности."
            : "Now it is studying the glasses without owner identities. A rare moment of methodological honesty."
        }
      />
    );
  }

  if (sommelier.phase === "voting" && sommelier.currentProfile) {
    const sealed = privateStatus?.hasSubmittedBallot || ballotSubmittedLocal;
    const candidates = sommelier.submittedPlayerIds
      .filter((playerId) => playerId !== me.id)
      .map((playerId) => state.players.find((player) => player.id === playerId))
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
    return (
      <SommelierCard>
        <div className="flex items-center justify-between gap-3">
          <Pill>
            {locale === "ru" ? "Анонимный бокал" : "Anonymous glass"} · {sommelier.roundNumber}/
            {sommelier.totalRounds}
          </Pill>
          <span className="font-display text-xl tabular-nums text-fuchsia-100">
            {formatClock(remaining)}
          </span>
        </div>
        <h2 className="mt-3 font-display text-3xl">{sommelier.currentProfile.drink_guess}</h2>
        <p className="mt-3 text-sm italic leading-relaxed text-white/55">
          {sommelier.currentProfile.tasting_notes}
        </p>
        <div className="mt-5 rounded-2xl border border-fuchsia-100/15 bg-fuchsia-300/10 p-5 text-left">
          <div className="text-[10px] uppercase tracking-widest text-fuchsia-100/45">
            {locale === "ru" ? "Портрет владельца" : "Owner profile"}
          </div>
          <p className="mt-2 leading-relaxed text-white/85">
            {sommelier.currentProfile.owner_profile}
          </p>
        </div>
        <div className="mt-3 text-xs text-white/40">
          {locale === "ru" ? "Претенциозность" : "Pretentiousness"}:{" "}
          {sommelier.currentProfile.pretentiousness}/10 · {sommelier.currentProfile.pairing_advice}
        </div>

        <div className="mt-6">
          {!privateStatus ? (
            <div className="animate-pulse text-sm text-white/45">
              {locale === "ru" ? "Проверяем твоё алиби…" : "Checking your alibi…"}
            </div>
          ) : privateStatus.isOwner ? (
            <div className="rounded-2xl border border-amber-100/15 bg-amber-300/10 p-5 text-sm text-amber-50/75">
              {locale === "ru"
                ? "Это твой бокал. Держи лицо нейтрально и не помогай следствию."
                : "This is your glass. Keep a neutral face and do not assist the investigation."}
            </div>
          ) : sealed ? (
            <div className="rounded-2xl border border-emerald-100/15 bg-emerald-300/10 p-5 text-sm text-emerald-50/75">
              {locale === "ru" ? "Версия запечатана." : "Theory sealed."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={busy || remaining <= 0}
                  onClick={() => void guess(candidate.id)}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 font-semibold disabled:opacity-40"
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </SommelierCard>
    );
  }

  if (sommelier.phase === "reveal" && sommelier.result) {
    const result = sommelier.result;
    const guessedCorrectly = result.correctGuesserIds.includes(me.id);
    const isOwner = result.ownerPlayerId === me.id;
    return (
      <SommelierCard>
        <Pill>{locale === "ru" ? "Владелец раскрыт" : "Owner revealed"}</Pill>
        <h2 className="mt-2 font-display text-4xl">{result.ownerPlayerName}</h2>
        <p className="mt-3 text-sm text-white/60">{result.profile.drink_guess}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="font-display text-3xl text-fuchsia-100">
            {guessedCorrectly ? "+3" : isOwner && result.ownerPoints > 0 ? "+5" : "0"}
          </div>
          <div className="mt-1 text-sm text-white/55">
            {guessedCorrectly
              ? locale === "ru"
                ? "Ты прочитал человека по бокалу. Неловко точно."
                : "You read a person through a glass. Uncomfortably accurate."
              : isOwner && result.ownerPoints > 0
                ? locale === "ru"
                  ? "Никто не вычислил твой бокал. Алиби выдержало."
                  : "Nobody identified your glass. The alibi held."
                : locale === "ru"
                  ? "Улика была рядом. Теория — нет."
                  : "The evidence was nearby. The theory was not."}
          </div>
        </div>
      </SommelierCard>
    );
  }

  if (sommelier.phase === "crowd-favorite") {
    return (
      <Waiting
        title={locale === "ru" ? "Суд измеряет громкость" : "Court measuring volume"}
        body={
          locale === "ru"
            ? "Ведущий выбирает один портрет, который вызвал самый громкий живой ор."
            : "The host is choosing the one portrait that caused the loudest real reaction."
        }
      />
    );
  }

  if (sommelier.phase === "results") {
    const favorite = state.players.find((player) => player.id === sommelier.crowdFavoriteOwnerId);
    const isFavorite = sommelier.crowdFavoriteOwnerId === me.id;
    return (
      <SommelierCard>
        <Pill>{locale === "ru" ? "Барный протокол закрыт" : "Bar file closed"}</Pill>
        <h2 className="mt-2 font-display text-4xl">
          {isFavorite
            ? locale === "ru"
              ? "Твой бокал сломал зал"
              : "Your glass broke the room"
            : locale === "ru"
              ? "Реакция вечера"
              : "Reaction of the night"}
        </h2>
        <p className="mt-4 text-white/65">
          {favorite?.name ?? sommelier.crowdFavoriteOwnerId} · +3
        </p>
      </SommelierCard>
    );
  }

  return (
    <Waiting
      title="Sommelier Charlatan"
      body={locale === "ru" ? "Ждём ведущего." : "Waiting for host."}
    />
  );
}

function SommelierCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-fuchsia-100/15 bg-[linear-gradient(145deg,oklch(0.22_0.06_320),oklch(0.11_0.025_285))] p-6 text-center text-white shadow-xl">
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.23em] text-fuchsia-100/55">{children}</div>
  );
}

function Waiting({ title, body }: { title: string; body: string }) {
  return (
    <SommelierCard>
      <Pill>Sommelier Charlatan</Pill>
      <h2 className="mt-2 font-display text-3xl">{title}</h2>
      <p className="mt-4 text-sm text-white/65">{body}</p>
    </SommelierCard>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-red-200/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">
      {children}
    </div>
  );
}
