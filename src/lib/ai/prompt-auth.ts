import { z } from "zod";

/** Small client-safe validator fragment; actual authorization and context lookup stay server-only. */
export const hostPromptAuthFields = {
  roomId: z.string().uuid(),
  hostSecret: z.string().trim().min(1).max(256),
};
