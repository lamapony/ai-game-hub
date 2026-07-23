export function speechUrl(text: string, roomId: string, voice?: string) {
  const search = new URLSearchParams({ text, roomId });
  if (voice) search.set("voice", voice);
  return `/api/speak?${search.toString()}`;
}

export function speakText(text: string, roomId: string) {
  const audio = new Audio(speechUrl(text, roomId));
  audio.play().catch(() => undefined);
  return audio;
}
