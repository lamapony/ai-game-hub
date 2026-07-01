// Single-photo capture using the platform camera (file input with capture=environment).
// Works on iOS Safari and Android Chrome without MediaRecorder/getUserMedia gymnastics.
import { useRef, useState } from "react";
import { friendlyUploadError } from "@/lib/media-errors";

export function PhotoCapture({
  onCapture,
  disabled,
}: {
  onCapture: (file: File, dataUrl: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function open() {
    setErr(null);
    inputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPreview(url);
      onCapture(file, url);
    };
    reader.onerror = () => {
      setErr(friendlyUploadError(reader.error, "photo"));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
      {preview ? (
        <div className="rounded-2xl overflow-hidden bg-black/40 border border-white/10">
          <img src={preview} alt="Твой кадр" className="w-full max-h-[60vh] object-contain" />
          <button
            onClick={open}
            disabled={disabled}
            className="w-full py-3 text-sm bg-white/10 text-white disabled:opacity-50"
          >
            ↻ Переснять
          </button>
        </div>
      ) : (
        <button
          onClick={open}
          disabled={disabled}
          className="w-full rounded-3xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] py-6 text-xl font-display disabled:opacity-50"
        >
          📸 Открыть камеру
        </button>
      )}
      {err && <p className="text-sm text-red-300 text-center">{err}</p>}
    </div>
  );
}
