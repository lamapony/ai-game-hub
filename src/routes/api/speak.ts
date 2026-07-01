// TTS endpoint: returns an MP3 stream for a given text. Cached by browser via query string.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/speak")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const text = (url.searchParams.get("text") ?? "").slice(0, 600);
        const voice = url.searchParams.get("voice") ?? "alloy";
        if (!text) return new Response("text required", { status: 400 });
        const { ttsMp3 } = await import("@/lib/ai-gateway.server");
        try {
          const buf = await ttsMp3(text, voice);
          return new Response(buf, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          return new Response(`TTS failed: ${e instanceof Error ? e.message : "error"}`, {
            status: 502,
          });
        }
      },
    },
  },
});
