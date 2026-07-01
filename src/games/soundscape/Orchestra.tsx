// Plays scheduled cues for one slot. Driven by props (mix, startAt, slot).
import { useEffect, useRef } from "react";
import type { SoundscapeMix } from "@/lib/types";

const PAST_CUE_GRACE_MS = 1000;

type Props = {
  slot: number;
  mix: SoundscapeMix | null | undefined;
  startAt: number | null | undefined; // epoch ms; null = idle
  intro?: { text: string; slot: number } | null; // spoken on slot 1 right at startAt
  onCueFired?: (cue: { atMs: number; kind: string }) => void;
};

export function Orchestra({ slot, mix, startAt, intro, onCueFired }: Props) {
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const onCueFiredRef = useRef(onCueFired);

  useEffect(() => {
    onCueFiredRef.current = onCueFired;
  }, [onCueFired]);

  useEffect(() => {
    // cleanup any pending
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    audiosRef.current.forEach((a) => {
      try {
        a.pause();
      } catch {
        /* */
      }
    });
    audiosRef.current = [];

    if (!mix || !startAt) return;
    const now = Date.now();
    const offsetToStart = startAt - now;

    const fire = (delay: number, fn: () => void) => {
      if (delay < -PAST_CUE_GRACE_MS) return;
      const t = setTimeout(fn, Math.max(0, delay));
      timeoutsRef.current.push(t);
    };

    // Intro (only on the slot it targets, usually 1)
    const introText = intro?.text;
    const introSlot = intro?.slot;

    if (introText && introSlot === slot) {
      fire(offsetToStart, () => {
        const a = new Audio(`/api/speak?text=${encodeURIComponent(introText)}`);
        a.volume = 1;
        a.play().catch(() => {});
        audiosRef.current.push(a);
        onCueFiredRef.current?.({ atMs: 0, kind: "intro" });
      });
    }

    for (const cue of mix.cues) {
      if (cue.slot !== slot) continue;
      fire(offsetToStart + cue.atMs, () => {
        if (cue.type === "audio" && cue.url) {
          const a = new Audio(cue.url);
          a.volume = 1;
          a.play().catch(() => {});
          audiosRef.current.push(a);
        } else if (cue.type === "tts" && cue.text) {
          const a = new Audio(`/api/speak?text=${encodeURIComponent(cue.text)}`);
          a.volume = 1;
          a.play().catch(() => {});
          audiosRef.current.push(a);
        }
        onCueFiredRef.current?.({ atMs: cue.atMs, kind: cue.type });
      });
    }

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      audiosRef.current.forEach((a) => {
        try {
          a.pause();
        } catch {
          /* */
        }
      });
      audiosRef.current = [];
    };
  }, [mix, startAt, slot, intro?.text, intro?.slot]);

  return null;
}
