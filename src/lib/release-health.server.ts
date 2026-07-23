import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RECORDINGS_BUCKET } from "./player-media.server";
import { buildReleaseHealth, type ReleaseHealthReport } from "./release-health";

async function tableIsAvailable(table: "party_records" | "score_events"): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from(table)
      .select(table === "party_records" ? "id, session_started_at" : "id")
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function privateMediaStorageIsAvailable(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(RECORDINGS_BUCKET);
    return !error && data.name === RECORDINGS_BUCKET && data.public === false;
  } catch {
    return false;
  }
}

export async function checkReleaseHealth(): Promise<ReleaseHealthReport> {
  const [privateMemory, scoreLedger, mediaStorage] = await Promise.all([
    tableIsAvailable("party_records"),
    tableIsAvailable("score_events"),
    privateMediaStorageIsAvailable(),
  ]);

  return buildReleaseHealth({
    privateMemory,
    scoreLedger,
    mediaStorage,
    aiRuntime: Boolean(process.env.OPENAI_API_KEY?.trim()),
  });
}
