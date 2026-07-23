import { useRef, useState } from "react";
import { friendlyUploadError } from "@/lib/media-errors";

export function PhotoCapture({
  onCapture,
  disabled,
  captureLabel = "📸 Open camera",
  retakeLabel = "↻ Retake",
  buttonClassName = "bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)]",
}: {
  onCapture: (file: File, dataUrl: string) => void;
  disabled?: boolean;
  captureLabel?: string;
  retakeLabel?: string;
  buttonClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function open() {
    setErr(null);
    inputRef.current?.click();
  }

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPreview(url);
      onCapture(file, url);
      input.value = "";
    };
    reader.onerror = () => {
      setErr(friendlyUploadError(reader.error, "photo"));
      input.value = "";
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      data-testid="photo-capture"
      data-state={preview ? "preview" : "idle"}
      className="space-y-3"
    >
      <input
        data-testid="photo-capture-input"
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
      {preview ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <img src={preview} alt="Your shot" className="max-h-[60vh] w-full object-contain" />
          <button
            data-testid="photo-capture-open"
            type="button"
            onClick={open}
            disabled={disabled}
            className="w-full bg-white/10 py-3 text-sm text-white disabled:opacity-50"
          >
            {retakeLabel}
          </button>
        </div>
      ) : (
        <button
          data-testid="photo-capture-open"
          type="button"
          onClick={open}
          disabled={disabled}
          className={`w-full rounded-3xl py-6 font-display text-xl disabled:opacity-50 ${buttonClassName}`}
        >
          {captureLabel}
        </button>
      )}
      {err && (
        <p data-testid="photo-capture-error" className="text-center text-sm text-red-300">
          {err}
        </p>
      )}
    </div>
  );
}
