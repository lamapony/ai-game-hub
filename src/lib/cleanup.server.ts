import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RECORDINGS_BUCKET = "recordings";
const DEFAULT_RETENTION_HOURS = 24;
const MAX_DELETE_BATCH = 100;
const STORAGE_PAGE_SIZE = 100;

type CleanupOptions = {
  retentionHours?: number;
  dryRun?: boolean;
  now?: Date;
};

type StorageEntry = {
  name: string;
  id?: string | null;
  metadata?: unknown;
};

type CleanupResult = {
  dryRun: boolean;
  cutoffIso: string;
  retentionHours: number;
  roomsMatched: number;
  roomsDeleted: number;
  rowsDeleted: {
    challenges: number;
    photos: number;
    submissions: number;
    votes: number;
  };
  storageObjectsMatched: number;
  storageObjectsDeleted: number;
  errors: string[];
};

function normalizeRetentionHours(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return DEFAULT_RETENTION_HOURS;
  return Math.max(1, Math.min(24 * 30, Math.floor(value)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function isStorageFolder(entry: StorageEntry) {
  return entry.id === null || (!entry.id && !entry.metadata);
}

async function listStorageFiles(prefix: string): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).list(prefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;

    const entries = ((data ?? []) as StorageEntry[]).filter(
      (entry) => entry.name !== ".emptyFolderPlaceholder",
    );
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isStorageFolder(entry)) {
        files.push(...(await listStorageFiles(path)));
      } else {
        files.push(path);
      }
    }

    if (entries.length < STORAGE_PAGE_SIZE) break;
    offset += STORAGE_PAGE_SIZE;
  }

  return files;
}

async function deleteRows(
  table: "challenges" | "photos" | "submissions" | "votes",
  roomIds: string[],
  dryRun: boolean,
) {
  if (roomIds.length === 0) return 0;
  let deleted = 0;

  for (const ids of chunk(roomIds, MAX_DELETE_BATCH)) {
    const countQuery = supabaseAdmin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("room_id", ids);
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;
    deleted += count ?? 0;

    if (!dryRun) {
      const { error } = await supabaseAdmin.from(table).delete().in("room_id", ids);
      if (error) throw error;
    }
  }

  return deleted;
}

export async function cleanupOldRooms(options: CleanupOptions = {}): Promise<CleanupResult> {
  const retentionHours = normalizeRetentionHours(options.retentionHours);
  const now = options.now ?? new Date();
  const cutoffIso = new Date(now.getTime() - retentionHours * 60 * 60 * 1000).toISOString();
  const dryRun = options.dryRun ?? false;
  const errors: string[] = [];
  const failedStorageRoomIds = new Set<string>();

  const { data: rooms, error: roomsError } = await supabaseAdmin
    .from("rooms")
    .select("id")
    .lt("updated_at", cutoffIso)
    .order("updated_at", { ascending: true });
  if (roomsError) throw roomsError;

  const roomIds = (rooms ?? []).map((room) => room.id);
  const result: CleanupResult = {
    dryRun,
    cutoffIso,
    retentionHours,
    roomsMatched: roomIds.length,
    roomsDeleted: 0,
    rowsDeleted: {
      challenges: 0,
      photos: 0,
      submissions: 0,
      votes: 0,
    },
    storageObjectsMatched: 0,
    storageObjectsDeleted: 0,
    errors,
  };

  if (roomIds.length === 0) return result;

  for (const roomId of roomIds) {
    try {
      const files = await listStorageFiles(roomId);
      result.storageObjectsMatched += files.length;
      if (!dryRun && files.length > 0) {
        for (const paths of chunk(files, MAX_DELETE_BATCH)) {
          const { error } = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).remove(paths);
          if (error) throw error;
          result.storageObjectsDeleted += paths.length;
        }
      }
    } catch (error) {
      failedStorageRoomIds.add(roomId);
      errors.push(
        `storage:${roomId}:${error instanceof Error ? error.message : "failed to delete storage prefix"}`,
      );
    }
  }

  const cleanableRoomIds = roomIds.filter((roomId) => !failedStorageRoomIds.has(roomId));

  result.rowsDeleted.challenges = await deleteRows("challenges", cleanableRoomIds, dryRun);
  result.rowsDeleted.photos = await deleteRows("photos", cleanableRoomIds, dryRun);
  result.rowsDeleted.submissions = await deleteRows("submissions", cleanableRoomIds, dryRun);
  result.rowsDeleted.votes = await deleteRows("votes", cleanableRoomIds, dryRun);

  if (!dryRun) {
    for (const ids of chunk(cleanableRoomIds, MAX_DELETE_BATCH)) {
      const { error } = await supabaseAdmin.from("rooms").delete().in("id", ids);
      if (error) throw error;
    }
    result.roomsDeleted = cleanableRoomIds.length;
  }

  return result;
}
