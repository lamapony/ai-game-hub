import type { Team } from "./types";

export function teamColorClasses(c: Team["color"]): {
  bg: string;
  text: string;
  ring: string;
  chip: string;
} {
  switch (c) {
    case "red":
      return {
        bg: "bg-[var(--color-team-red)]",
        text: "text-[var(--color-team-red)]",
        ring: "ring-[var(--color-team-red)]",
        chip: "bg-[var(--color-team-red)]/15 text-[var(--color-team-red)] border-[var(--color-team-red)]/30",
      };
    case "blue":
      return {
        bg: "bg-[var(--color-team-blue)]",
        text: "text-[var(--color-team-blue)]",
        ring: "ring-[var(--color-team-blue)]",
        chip: "bg-[var(--color-team-blue)]/15 text-[var(--color-team-blue)] border-[var(--color-team-blue)]/30",
      };
    case "green":
      return {
        bg: "bg-[var(--color-team-green)]",
        text: "text-[var(--color-team-green)]",
        ring: "ring-[var(--color-team-green)]",
        chip: "bg-[var(--color-team-green)]/15 text-[var(--color-team-green)] border-[var(--color-team-green)]/30",
      };
    case "amber":
      return {
        bg: "bg-[var(--color-team-amber)]",
        text: "text-[var(--color-team-amber)]",
        ring: "ring-[var(--color-team-amber)]",
        chip: "bg-[var(--color-team-amber)]/15 text-[var(--color-team-amber)] border-[var(--color-team-amber)]/30",
      };
  }
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
