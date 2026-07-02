import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { eventProfile } from "@/lib/event-profile";
import { createRoom } from "@/lib/room";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: eventProfile.seo.titleRu },
      {
        name: "description",
        content: eventProfile.seo.descriptionRu,
      },
      { property: "og:title", content: eventProfile.title },
      {
        property: "og:description",
        content: eventProfile.seo.ogDescriptionRu,
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate() {
    setErr(null);
    setCreating(true);
    try {
      const { code } = await createRoom(eventProfile.defaultHostName);
      navigate({ to: "/host/$code", params: { code } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не получилось создать комнату");
      setCreating(false);
    }
  }
  function onJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 3) {
      setErr("Введи код или попроси у ведущего QR");
      return;
    }
    navigate({ to: "/play/$code", params: { code } });
  }

  return (
    <main className="min-h-dvh park-gradient relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            "radial-gradient(800px 400px at 20% 0%, oklch(0.9 0.18 145 / 0.45), transparent 60%), radial-gradient(600px 400px at 80% 100%, oklch(0.45 0.15 165 / 0.6), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-5 pt-8 pb-14 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-[11px] tracking-wide uppercase text-white/80">
            <span className="size-1.5 rounded-full bg-[var(--color-park-bright)]" />{" "}
            {eventProfile.landing.badgeRu}
          </div>
          <h1 className="font-display mt-5 text-6xl sm:text-7xl text-white leading-[0.95]">
            {eventProfile.titleLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-4 max-w-lg text-white/80 text-base sm:text-lg">
            {eventProfile.landing.descriptionRu}
          </p>
        </header>

        {/* Главная кнопка: создать парти прямо с телефона */}
        <section className="rounded-3xl bg-black/45 backdrop-blur p-6 border border-white/10">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
                Начать тусовку
              </div>
              <h2 className="font-display text-3xl mt-1 text-white">Сделать парти</h2>
            </div>
            <span className="text-3xl">🌳</span>
          </div>
          <p className="text-sm text-white/70 mt-2">
            Создаст комнату и покажет QR-код. Друзья наводят камеру — и они в игре.
          </p>
          <button
            onClick={onCreate}
            disabled={creating}
            className="mt-4 w-full rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-medium py-4 text-lg hover:brightness-110 transition disabled:opacity-50"
          >
            {creating ? "Создаём…" : "Создать комнату →"}
          </button>
        </section>

        {/* Войти по коду — если ведущий уже создал */}
        <section className="mt-4 rounded-3xl bg-black/35 backdrop-blur p-6 border border-white/10">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">
                Уже есть QR или код
              </div>
              <h2 className="font-display text-2xl mt-1 text-white">Войти в комнату</h2>
            </div>
            <span className="text-2xl">📱</span>
          </div>
          <p className="text-sm text-white/60 mt-2">
            Если не получилось отсканировать QR — введи 4 буквы.
          </p>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            className="mt-3 w-full bg-white/10 text-white text-2xl font-display tracking-[0.4em] text-center placeholder-white/25 rounded-2xl px-4 py-3 outline-none focus:bg-white/15 uppercase"
          />
          <button
            onClick={onJoin}
            className="mt-3 w-full rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium py-3 transition"
          >
            Войти по коду →
          </button>
          {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
        </section>
      </div>
    </main>
  );
}
