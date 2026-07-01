// Accepts multipart audio upload, returns { text }.
import { createFileRoute } from "@tanstack/react-router";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof Blob)) {
            logWarn("api.transcribe.invalid", {
              durationMs: Date.now() - startedAt,
              status: 400,
            });
            return new Response("file required", { status: 400 });
          }
          const filename = (form.get("filename") as string) || "recording.webm";
          const { transcribeAudio } = await import("@/lib/ai-gateway.server");
          const text = await transcribeAudio(file, filename);
          logInfo("api.transcribe.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            fileBytes: file.size,
            textChars: text.length,
          });
          return Response.json({ text });
        } catch (e) {
          logError("api.transcribe.fallback", e, {
            durationMs: Date.now() - startedAt,
            status: 200,
            fallback: true,
          });
          return Response.json({ text: "", fallback: true });
        }
      },
    },
  },
});
