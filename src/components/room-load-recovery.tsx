import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { roomLookupRecoveryCopy } from "@/lib/room-entry-errors";

export function RoomLoadRecovery({
  code,
  error,
  onRetry,
}: {
  code: string;
  error: string | null;
  onRetry: () => Promise<unknown>;
}) {
  const [retrying, setRetrying] = useState(false);
  const copy = roomLookupRecoveryCopy(code, error);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // useRoom owns the privacy-safe failure state for the next render.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section
      className="w-full max-w-lg text-center text-white"
      data-testid="room-load-recovery"
      data-failure-kind={copy.failureKind}
      role="alert"
    >
      <p className="text-sm text-white/60">Room {code}</p>
      <h1 className="mt-2 font-display text-4xl">{copy.title}</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/75">{copy.body}</p>
      <button
        type="button"
        className="mt-6 w-full rounded-3xl bg-white px-5 py-4 font-semibold text-[oklch(0.18_0.05_160)] disabled:opacity-60"
        disabled={retrying}
        onClick={() => void retry()}
      >
        {retrying ? "Checking…" : "Check room again"}
      </button>
      <Link to="/" className="mt-5 inline-block text-sm text-white/65 hover:text-white">
        Back to AI Game Hub
      </Link>
    </section>
  );
}
