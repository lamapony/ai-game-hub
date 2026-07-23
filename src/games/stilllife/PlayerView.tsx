import { useEffect, useState } from "react";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { PhotoCapture } from "@/components/photo-capture";
import { downscaleImage } from "@/lib/image-client";
import { friendlyUploadError } from "@/lib/media-errors";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import type { StoredPlayer } from "@/lib/player-action-client";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import { submitStillLifePhotoClient, submitStillLifeVoteClient } from "@/lib/stilllife-client";
import { formatClock } from "@/lib/team-style";
import type { RoomState } from "@/lib/types";

export function StillLifePlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const still = state.stilllife!;
  const locale = state.party?.uiLocale ?? "en";
  const player = state.players.find((candidate) => candidate.id === me.id);
  const teamId = player?.teamId ?? "";
  const team = state.teams.find((candidate) => candidate.id === teamId);
  const teamSubmitted = still.submittedTeamIds.includes(teamId);
  const ballotSubmitted = still.submittedVoterIds.includes(me.id);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoSubmittedLocal, setPhotoSubmittedLocal] = useState(false);
  const [ballotSubmittedLocal, setBallotSubmittedLocal] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setBusy(false);
    setError(null);
    setPhotoSubmittedLocal(false);
    setBallotSubmittedLocal(false);
  }, [still.roundId]);

  async function capture(file: File) {
    setBusy(true);
    setError(null);
    try {
      const image = await downscaleImage(file, 1024, 0.82);
      const storagePath = await uploadPlayerMedia(
        roomId,
        {
          action: "stilllife-photo",
          playerId: me.id,
          roundId: still.roundId,
          mimeType: "image/jpeg",
        },
        image.blob,
      );
      await submitStillLifePhotoClient({
        roomId,
        roundId: still.roundId,
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

  async function vote(teamIdToVote: string) {
    setBusy(true);
    setError(null);
    try {
      await submitStillLifeVoteClient({
        roomId,
        roundId: still.roundId,
        playerId: me.id,
        teamId: teamIdToVote,
      });
      setBallotSubmittedLocal(true);
    } catch (voteError) {
      setError(friendlyPlayerActionError(voteError, "Still Life ballot"));
    } finally {
      setBusy(false);
    }
  }

  const timerEnd = still.phase === "building" ? still.buildingEndsAt : still.votingEndsAt;
  const remaining = Math.max(0, (timerEnd ?? now) - now);

  if (still.phase === "briefing") {
    return (
      <StillCard>
        <Pill>{locale === "ru" ? "Аукцион готовится" : "Auction preparing"}</Pill>
        <h2 className="mt-2 font-display text-3xl">
          {locale === "ru" ? "Не ешьте реквизит раньше времени" : "Do not eat the props yet"}
        </h2>
        <p className="mt-4 text-sm text-white/60">
          {locale === "ru"
            ? "AI формулирует конфликт, который вашей команде придётся построить руками."
            : "AI is writing a conflict your team will have to build by hand."}
        </p>
        <GameRulesChecklist gameId="stilllife" />
      </StillCard>
    );
  }

  if (still.phase === "building") {
    return (
      <StillCard>
        <div className="flex items-center justify-between gap-3">
          <Pill>{team?.name ?? teamId}</Pill>
          <span className="font-display text-xl tabular-nums text-orange-100">
            {formatClock(remaining)}
          </span>
        </div>
        <h2 className="mt-3 font-display text-3xl">{still.headline}</h2>
        <p className="mt-4 text-sm leading-relaxed text-white/65">
          {locale === "ru"
            ? "Отложите телефон. Стройте из еды, фольги, тарелок и того, что реально происходит вокруг. Дым ценен только с безопасного расстояния."
            : "Put the phone down. Build with food, foil, plates and what is really happening around you. Smoke only counts from a safe distance."}
        </p>
        <div className="mt-6">
          {teamSubmitted || photoSubmittedLocal ? (
            <div className="rounded-2xl border border-emerald-100/15 bg-emerald-300/10 p-5 text-sm text-emerald-50/75">
              {locale === "ru"
                ? "Командный кадр принят. Теперь защищайте инсталляцию взглядом."
                : "Team photo accepted. Defend the installation with eye contact."}
            </div>
          ) : (
            <PhotoCapture
              disabled={busy || remaining <= 0}
              onCapture={(file) => void capture(file)}
              captureLabel={
                busy
                  ? locale === "ru"
                    ? "Отправляем лот…"
                    : "Submitting lot…"
                  : locale === "ru"
                    ? "📸 Снять командный лот"
                    : "📸 Photograph team lot"
              }
              retakeLabel={locale === "ru" ? "↻ Переснять и отправить" : "↻ Retake and submit"}
              buttonClassName="bg-orange-100 text-stone-950"
            />
          )}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </StillCard>
    );
  }

  if (still.phase === "judging") {
    return (
      <Waiting
        title={locale === "ru" ? "Монокль опущен" : "Monocle deployed"}
        body={
          locale === "ru"
            ? "Критик изучает композицию, драму и реальную среду. Не объясняйте искусство — это его унижает."
            : "The critic is inspecting composition, drama and the real environment. Do not explain the art; it humiliates it."
        }
      />
    );
  }

  if (still.phase === "voting" && still.judgments) {
    const choices = still.judgments.filter((entry) => entry.teamId !== teamId);
    return (
      <StillCard>
        <div className="flex items-center justify-between gap-3">
          <Pill>{locale === "ru" ? "Зрительский тайбрейк" : "Audience tie-break"}</Pill>
          <span className="font-display text-xl tabular-nums text-orange-100">
            {formatClock(remaining)}
          </span>
        </div>
        <h2 className="mt-3 font-display text-3xl">
          {ballotSubmitted || ballotSubmittedLocal
            ? locale === "ru"
              ? "Бюллетень запечатан"
              : "Ballot sealed"
            : locale === "ru"
              ? "Чужой лот, который ты купил бы"
              : "Another team's lot you would buy"}
        </h2>
        <div className="mt-5 space-y-3 text-left">
          {choices.map((entry) => (
            <button
              key={entry.teamId}
              type="button"
              disabled={busy || ballotSubmitted || ballotSubmittedLocal}
              onClick={() => void vote(entry.teamId)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{entry.teamName}</span>
                <span className="rounded-full bg-orange-100/10 px-3 py-1 text-xs text-orange-100">
                  {entry.points}/25
                </span>
              </div>
              <div className="mt-1 font-display text-xl">{entry.catalogTitle}</div>
              <p className="mt-2 text-xs leading-relaxed text-white/50">{entry.critique}</p>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-white/40">
          {locale === "ru"
            ? "Голос меняет исход только при точном равенстве оценки жюри. За свою команду голосовать нельзя."
            : "The ballot changes the outcome only on an exact jury-score tie. You cannot vote for your own team."}
        </p>
        {error && <ErrorText>{error}</ErrorText>}
      </StillCard>
    );
  }

  if (still.phase === "results" && still.result) {
    const won = still.result.winningTeamIds.includes(teamId);
    return (
      <StillCard>
        <Pill>{locale === "ru" ? "Молоток ударил" : "Hammer down"}</Pill>
        <h2 className="mt-2 font-display text-4xl">
          {won
            ? locale === "ru"
              ? "Ваш лот продан"
              : "Your lot sold"
            : locale === "ru"
              ? "Искусство пережило вас"
              : "The art survived you"}
        </h2>
        <div className="mt-5 space-y-3 text-left">
          {still.result.entries.map((entry) => (
            <div key={entry.teamId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{entry.teamName}</span>
                <span className="font-display text-2xl text-orange-100">+{entry.points}</span>
              </div>
              <div className="mt-1 text-lg">{entry.catalogTitle}</div>
              <div className="mt-2 text-xs text-white/45">
                C {entry.compositionScore}/10 · D {entry.dramaScore}/10 · Env {entry.materialScore}
                /5 · {entry.audienceVotes} votes
              </div>
            </div>
          ))}
        </div>
      </StillCard>
    );
  }

  return (
    <Waiting title="Still Life" body={locale === "ru" ? "Ждём ведущего." : "Waiting for host."} />
  );
}

function StillCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-orange-100/15 bg-[linear-gradient(145deg,oklch(0.22_0.05_45),oklch(0.12_0.025_28))] p-6 text-center text-white shadow-xl">
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.23em] text-orange-100/55">{children}</div>
  );
}

function Waiting({ title, body }: { title: string; body: string }) {
  return (
    <StillCard>
      <Pill>Still Life Survival</Pill>
      <h2 className="mt-2 font-display text-3xl">{title}</h2>
      <p className="mt-4 text-sm text-white/65">{body}</p>
    </StillCard>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl bg-red-950/60 p-3 text-sm text-red-100">{children}</p>;
}
