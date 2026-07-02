import { useCallback, useRef, useState } from "react";

export type ClientVoiceSession = {
  provider: "openai" | "xai";
  model: string;
  transport: "webrtc" | "websocket";
  clientSecret: string;
  connectUrl: string;
  protocol?: string;
  expiresAt?: number;
};

type VoiceStatus = "idle" | "connecting" | "connected" | "fallback" | "error";

function hostTextEvent(text: string) {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  };
}

function responseEvent() {
  return {
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
    },
  };
}

export function speakWithFallback(text: string, voice?: string) {
  const params = new URLSearchParams({ text });
  if (voice) params.set("voice", voice);
  const audio = new Audio(`/api/speak?${params.toString()}`);
  return audio.play();
}

export function useRealtimeVoice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ClientVoiceSession | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    dcRef.current?.close();
    wsRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.remove();
    dcRef.current = null;
    wsRef.current = null;
    pcRef.current = null;
    audioRef.current = null;
    setSession(null);
    setStatus("idle");
  }, []);

  const start = useCallback(
    async (nextSession: ClientVoiceSession) => {
      stop();
      setError(null);
      setStatus("connecting");
      setSession(nextSession);

      try {
        if (nextSession.transport === "webrtc") {
          const pc = new RTCPeerConnection();
          const audio = document.createElement("audio");
          audio.autoplay = true;
          audioRef.current = audio;
          pcRef.current = pc;
          pc.addTransceiver("audio", { direction: "recvonly" });
          pc.ontrack = (event) => {
            audio.srcObject = event.streams[0] ?? null;
          };

          const dc = pc.createDataChannel("oai-events");
          dcRef.current = dc;
          await new Promise<void>((resolve, reject) => {
            dc.addEventListener("open", () => resolve(), { once: true });
            dc.addEventListener("error", () => reject(new Error("Realtime data channel failed")), {
              once: true,
            });
            window.setTimeout(() => reject(new Error("Realtime data channel timed out")), 10_000);
            void (async () => {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              const sdpResponse = await fetch(nextSession.connectUrl, {
                method: "POST",
                body: offer.sdp,
                headers: {
                  Authorization: `Bearer ${nextSession.clientSecret}`,
                  "Content-Type": "application/sdp",
                },
              });
              if (!sdpResponse.ok) {
                throw new Error(`Realtime WebRTC failed: ${sdpResponse.status}`);
              }
              await pc.setRemoteDescription({
                type: "answer",
                sdp: await sdpResponse.text(),
              });
            })().catch(reject);
          });
          setStatus("connected");
          return;
        }

        const protocols = nextSession.protocol ? [nextSession.protocol] : undefined;
        const ws = new WebSocket(nextSession.connectUrl, protocols);
        wsRef.current = ws;
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener(
            "open",
            () => {
              ws.send(
                JSON.stringify({
                  type: "session.update",
                  session: {
                    voice: "eve",
                    instructions:
                      "You are a dry, smart English-speaking virtual event host. Keep turns short.",
                    turn_detection: { type: "server_vad" },
                  },
                }),
              );
              resolve();
            },
            { once: true },
          );
          ws.addEventListener("error", () => reject(new Error("Realtime WebSocket failed")), {
            once: true,
          });
          window.setTimeout(() => reject(new Error("Realtime WebSocket timed out")), 10_000);
        });
        setStatus("connected");
      } catch (caught) {
        stop();
        setStatus("fallback");
        setError(caught instanceof Error ? caught.message : "Realtime voice failed");
      }
    },
    [stop],
  );

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify(hostTextEvent(trimmed)));
      dcRef.current.send(JSON.stringify(responseEvent()));
      return true;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(hostTextEvent(trimmed)));
      wsRef.current.send(JSON.stringify(responseEvent()));
      return true;
    }
    await speakWithFallback(trimmed).catch(() => {});
    setStatus((current) => (current === "connected" ? "connected" : "fallback"));
    return false;
  }, []);

  return { status, error, session, start, stop, sendText };
}
