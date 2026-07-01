// Accepts multipart audio upload, returns { text }.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof Blob)) return new Response("file required", { status: 400 });
          const filename = (form.get("filename") as string) || "recording.webm";
          const { transcribeAudio } = await import("@/lib/ai-gateway.server");
          const text = await transcribeAudio(file, filename);
          return Response.json({ text });
        } catch (e) {
          console.error("[AI fallback] transcribe", e);
          return Response.json({ text: "", fallback: true });
        }
      },
    },
  },
});
