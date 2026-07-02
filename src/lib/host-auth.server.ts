import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RoomState } from "./types";

export type AuthorizedHostRoom = {
  id: string;
  code: string;
  state: RoomState;
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function hostSecretFromRequest(request: Request, body: { hostSecret?: unknown }) {
  const header = request.headers.get("x-host-secret");
  if (header?.trim()) return header.trim();
  return typeof body.hostSecret === "string" ? body.hostSecret : "";
}

export async function authorizeHostRoom(params: {
  code: string;
  hostSecret: string;
}): Promise<AuthorizedHostRoom> {
  const code = params.code.trim().toUpperCase();
  if (!code || !params.hostSecret) {
    throw Object.assign(new Error("host authorization required"), { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, code, host_secret, state")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("room not found"), { status: 404 });
  if (!timingSafeEqual(params.hostSecret, data.host_secret)) {
    throw Object.assign(new Error("invalid host secret"), { status: 403 });
  }

  return {
    id: data.id,
    code: data.code,
    state: data.state as unknown as RoomState,
  };
}

export async function writeAuthorizedRoomState(roomId: string, state: RoomState) {
  const { error } = await supabaseAdmin
    .from("rooms")
    .update({ state: state as never })
    .eq("id", roomId);
  if (error) throw error;
}
