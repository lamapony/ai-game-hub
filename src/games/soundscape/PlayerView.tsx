// Soundscape player view: topic vote, recording, voting.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateRoomState } from "@/lib/room";
import { isRetryableError, retryOperation } from "@/lib/retry";
import { logError } from "@/lib/structured-log";
import { Recorder } from "./Recorder";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import type { RoomState } from "@/lib/types";

export function SoundscapePlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const snd = state.soundscape!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  if (snd.phase === "topics") return <TopicVote state={state} roomId={roomId} me={me} />;
  if (snd.phase === "recording")
    return <RecordPhase state={state} roomId={roomId} me={me} now={now} />;
  if (snd.phase === "mixing")
    return <PassiveCard title="Composing…" sub="AI is arranging your sounds across the park." />;
  if (snd.phase === "playback")
    return (
      <PassiveCard
        title="Listen"
        sub="Sound is moving through the park. Spot which speakers are talking."
      />
    );
  if (snd.phase === "voting") return <VotePhase state={state} roomId={roomId} me={me} now={now} />;
  if (snd.phase === "results")
    return <PassiveCard title="See the big screen" sub="The host is reading the AI's verdict." />;
  return <PassiveCard title="Stand by…" sub="" />;
}

function PassiveCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-8 border border-white/10 text-center text-white">
      <div className="font-display text-2xl">{title}</div>
      {sub && <p className="text-white/60 text-sm mt-2">{sub}</p>}
    </div>
  );
}

function TopicVote({
  state,
  roomId,
  me,
}: {
  state: RoomState;
  roomId: string;
  me: { id: string };
}) {
  const snd = state.soundscape!;
  const myVote = snd.topicVotes?.[me.id];
  async function vote(t: string) {
    const topicVotes = { ...(snd.topicVotes ?? {}), [me.id]: t };
    await updateRoomState(roomId, { ...state, soundscape: { ...snd, topicVotes } });
  }
  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-black/40 backdrop-blur p-5 border border-white/10 text-white">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          Vote on a theme
        </div>
        <p className="text-sm text-white/70 mt-1">
          The host locks the most-voted theme in a moment.
        </p>
      </div>
      {(snd.topics ?? []).map((t) => (
        <button
          key={t}
          onClick={() => vote(t)}
          className={`w-full rounded-3xl border p-5 text-left transition ${myVote === t ? "bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] border-transparent" : "bg-black/40 border-white/10 text-white hover:bg-black/50"}`}
        >
          <div className="font-display text-xl">{t}</div>
        </button>
      ))}
      {!snd.topics && <PassiveCard title="Generating themes…" sub="" />}
    </div>
  );
}

function RecordPhase({
  state,
  roomId,
  me,
  now,
}: {
  state: RoomState;
  roomId: string;
  me: { id: string; name: string; teamId: string };
  now: number;
}) {
  const snd = state.soundscape!;
  const remaining = (snd.recordingEndsAt ?? now) - now;
  const team = state.teams.find((t) => t.id === me.teamId);
  const c = team ? teamColorClasses(team.color) : null;

  async function handleUpload(blob: Blob, durationMs: number) {
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const path = `${roomId}/${snd.roundId}/${me.id}-${Date.now()}.${ext}`;
    const uploadLogFields = {
      game: "soundscape",
      stage: "audio_upload",
      roomId,
      roundId: snd.roundId,
      playerId: me.id,
      teamId: me.teamId,
      mimeType: blob.type,
      blobSize: blob.size,
      durationMs,
    };
    const up = await retryOperation(
      async () => {
        const result = await supabase.storage
          .from("recordings")
          .upload(path, blob, { contentType: blob.type });
        if (result.error && isRetryableError(result.error)) throw result.error;
        return result;
      },
      { shouldRetry: (error) => isRetryableError(error) },
    );
    if (up.error) {
      logError("upload.failure", up.error, uploadLogFields);
      throw up.error;
    }
    const signed = await retryOperation(
      async () => {
        const result = await supabase.storage.from("recordings").createSignedUrl(path, 60 * 60 * 3);
        if (result.error && isRetryableError(result.error)) throw result.error;
        return result;
      },
      { shouldRetry: (error) => isRetryableError(error) },
    );
    if (signed.error) {
      logError("upload.failure", signed.error, { ...uploadLogFields, stage: "signed_url" });
      throw signed.error;
    }
    const audio_url = signed.data?.signedUrl ?? null;

    // transcribe
    let transcript = "";
    try {
      const fd = new FormData();
      fd.append("file", blob, `clip.${ext}`);
      fd.append("filename", `clip.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (res.ok) {
        transcript = (await res.json()).text ?? "";
      }
    } catch {
      /* non-fatal */
    }

    const inserted = await supabase.from("submissions").insert({
      room_id: roomId,
      round_id: snd.roundId,
      team_id: me.teamId,
      player_id: me.id,
      player_name: me.name,
      audio_url,
      transcript,
      duration_seconds: durationMs / 1000,
    });
    if (inserted.error) {
      logError("upload.failure", inserted.error, {
        ...uploadLogFields,
        stage: "submission_insert",
      });
      throw inserted.error;
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-black/40 backdrop-blur p-5 border border-white/10 text-white">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
              Capture sounds
            </div>
            <div className="text-white/70 text-sm mt-1">
              Theme: <strong className="text-white">"{snd.topic}"</strong>
            </div>
          </div>
          <div className="font-display text-3xl tabular-num">{formatClock(remaining)}</div>
        </div>
        <div
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${c?.chip ?? ""}`}
        >
          {team?.name}
        </div>
      </div>
      <Recorder onComplete={handleUpload} />
      <p className="text-xs text-white/60 text-center">
        Hold the phone close to the sound. Record as many clips as you can.
      </p>
    </div>
  );
}

function VotePhase({
  state,
  roomId,
  me,
  now,
}: {
  state: RoomState;
  roomId: string;
  me: { id: string; teamId: string };
  now: number;
}) {
  const snd = state.soundscape!;
  const [pending, setPending] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, string>>({});
  const remaining = Math.max(0, (snd.voteOpenAt ?? now) + 30_000 - now);
  const categories = [
    { id: "atmosphere", label: "🔥 Atmosphere" },
    { id: "laughs", label: "😂 Laughs" },
    { id: "creative", label: "🎨 Creative" },
  ];
  const otherTeams = state.teams.filter((t) => t.id !== me.teamId && snd.mixes?.[t.id]);

  async function castVote(targetId: string, category: string) {
    setPending(`${targetId}:${category}`);
    const { error } = await supabase.from("votes").insert({
      room_id: roomId,
      round_id: snd.roundId,
      target_team_id: targetId,
      voter_player_id: me.id,
      category,
    });
    setPending(null);
    if (!error) setVoted((v) => ({ ...v, [category]: targetId }));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-black/40 backdrop-blur p-5 border border-white/10 text-white">
        <div className="flex items-baseline justify-between">
          <div className="font-display text-xl">Vote — one per category</div>
          <div className="font-display text-2xl tabular-num">{formatClock(remaining)}</div>
        </div>
        <p className="text-xs text-white/60 mt-1">You can't vote for your own team.</p>
      </div>
      {categories.map((cat) => (
        <div
          key={cat.id}
          className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur p-4"
        >
          <div className="text-sm text-white/80 mb-2">{cat.label}</div>
          <div className="grid grid-cols-2 gap-2">
            {otherTeams.map((t) => {
              const c = teamColorClasses(t.color);
              const mine = voted[cat.id] === t.id;
              const isPending = pending === `${t.id}:${cat.id}`;
              return (
                <button
                  key={t.id}
                  onClick={() => castVote(t.id, cat.id)}
                  disabled={!!voted[cat.id]}
                  className={`rounded-2xl border p-3 text-left ${c.chip} ${mine ? "ring-2 ring-white" : ""} disabled:opacity-50`}
                >
                  <div className="font-medium">{t.name}</div>
                  {isPending && <div className="text-[10px] mt-1">sending…</div>}
                </button>
              );
            })}
            {otherTeams.length === 0 && (
              <div className="text-xs text-white/60">No other teams recorded.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
