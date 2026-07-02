export async function postSpeakerStatus(code: string, slot: number, connected: boolean) {
  const response = await fetch("/api/speaker-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, slot, connected }),
  });
  if (!response.ok) throw new Error(await response.text());
}
