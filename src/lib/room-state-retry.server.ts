import type { RoomState } from "./types";
import { statusError } from "./player-auth.server";

export type RoomStateSnapshot = {
  id: string;
  code?: string;
  state: RoomState;
  updatedAt: string;
};

export type OptimisticRoomUpdate<T> = {
  state: RoomState;
  value: T;
};

export function roomStateConflictError() {
  return statusError("room state changed, try again", 409);
}

export async function updateRoomStateWithOptimisticRetry<T>(params: {
  loadSnapshot: () => Promise<RoomStateSnapshot>;
  applyUpdate: (snapshot: RoomStateSnapshot) => Promise<OptimisticRoomUpdate<T>>;
  writeSnapshot: (snapshot: RoomStateSnapshot, state: RoomState) => Promise<boolean>;
  maxAttempts?: number;
  onConflict?: (attempt: number) => void | Promise<void>;
}) {
  const maxAttempts = params.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const snapshot = await params.loadSnapshot();
    const update = await params.applyUpdate(snapshot);
    const written = await params.writeSnapshot(snapshot, update.state);
    if (written) return { ...update, attempts: attempt, snapshot };
    await params.onConflict?.(attempt);
  }

  throw roomStateConflictError();
}
