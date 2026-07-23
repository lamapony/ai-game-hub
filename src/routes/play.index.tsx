import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { storedPlayerResumes } from "@/lib/room";
import { isValidRoomCode, normalizeRoomCodeInput } from "@/lib/room-code";

export const Route = createFileRoute("/play/")({
  component: PlayLanding,
});

function PlayLanding() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [resume, setResume] = useState<ReturnType<typeof storedPlayerResumes>[number] | null>(null);

  useEffect(() => {
    setResume(storedPlayerResumes(1)[0] ?? null);
  }, []);

  const codeReady = isValidRoomCode(code);

  function joinRoom() {
    const normalizedCode = normalizeRoomCodeInput(code);
    if (!isValidRoomCode(normalizedCode)) return;
    nav({ to: "/play/$code", params: { code: normalizedCode } });
  }

  return (
    <main className="min-h-dvh park-gradient flex items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-3xl bg-black/45 backdrop-blur p-6 border border-white/10">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          Player · phone
        </div>
        <h1 className="font-display text-3xl text-white mt-1">Enter room code</h1>
        <p className="text-sm text-white/70 mt-2">4 letters from the host screen.</p>
        {resume && (
          <button
            type="button"
            onClick={() => nav({ to: "/play/$code", params: { code: resume.code } })}
            className="mt-4 w-full rounded-2xl border border-[var(--color-park-bright)]/40 bg-[var(--color-park-bright)]/15 px-4 py-3 text-left text-white"
          >
            <span className="block text-[10px] uppercase tracking-widest text-[var(--color-park-bright)]">
              Resume
            </span>
            <span className="mt-1 block font-display text-xl">
              {resume.name} · {resume.code}
            </span>
          </button>
        )}
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            joinRoom();
          }}
        >
          <input
            data-testid="player-room-code"
            aria-label="Room code"
            aria-describedby="player-room-code-help"
            aria-invalid={code.length > 0 && !codeReady}
            value={code}
            onChange={(event) => setCode(normalizeRoomCodeInput(event.target.value))}
            placeholder="ABCD"
            inputMode="text"
            enterKeyHint="go"
            autoCapitalize="characters"
            autoFocus
            spellCheck={false}
            className="w-full bg-white/10 text-white text-3xl font-display tracking-[0.4em] text-center rounded-2xl px-4 py-4 outline-none focus:bg-white/15 uppercase"
          />
          <p
            id="player-room-code-help"
            className={`mt-2 text-xs ${codeReady ? "text-emerald-200" : "text-white/50"}`}
          >
            {codeReady ? "Code ready." : "Codes skip I, O, 0 and 1."}
          </p>
          <button
            data-testid="player-room-code-submit"
            type="submit"
            disabled={!codeReady}
            className="mt-3 w-full rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-medium py-4 text-lg hover:brightness-110 transition disabled:cursor-not-allowed disabled:opacity-35"
          >
            Join →
          </button>
        </form>
        <Link to="/" className="mt-5 block text-center text-white/60 text-sm hover:text-white">
          ← Home
        </Link>
      </div>
    </main>
  );
}
