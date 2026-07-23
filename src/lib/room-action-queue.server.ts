type RoomActionQueueEntry = Promise<void>;

const roomActionTails = new Map<string, RoomActionQueueEntry>();

export type RoomActionQueueResult<T> = {
  value: T;
  queueWaitMs: number;
};

/**
 * Serializes room-state mutations inside one server runtime. The database CAS
 * remains authoritative across runtimes; this queue prevents requests already
 * sharing a process from creating avoidable retry storms.
 */
export async function withRoomActionQueue<T>(
  roomId: string,
  action: () => Promise<T>,
  now: () => number = Date.now,
): Promise<RoomActionQueueResult<T>> {
  const key = roomId.trim();
  if (!key) throw new Error("roomId required");

  const queuedAt = now();
  const previous = roomActionTails.get(key) ?? Promise.resolve();
  let release = () => {};
  const ticket = new Promise<void>((resolve) => {
    release = resolve;
  });
  roomActionTails.set(key, ticket);

  await previous;
  const queueWaitMs = Math.max(0, now() - queuedAt);

  try {
    return { value: await action(), queueWaitMs };
  } finally {
    release();
    if (roomActionTails.get(key) === ticket) roomActionTails.delete(key);
  }
}
