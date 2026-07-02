import type { RoomState } from "./types";

export async function postHostState(code: string, hostSecret: string, state: RoomState) {
  if (!hostSecret) throw new Error("host authorization required");
  const response = await fetch("/api/host-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-host-secret": hostSecret,
    },
    body: JSON.stringify({ code, state }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { state: RoomState };
}
