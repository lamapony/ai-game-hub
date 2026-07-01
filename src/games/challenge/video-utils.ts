// Extract N evenly spaced frames from a video blob as JPEG data URLs.
export async function extractFrames(blob: Blob, count = 4): Promise<string[]> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });
    // Some browsers need a play tick before currentTime is honored.
    try {
      await video.play();
      video.pause();
    } catch {
      /* best effort */
    }
    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
    const w = 512;
    const h = Math.round((video.videoHeight || 720) * (w / (video.videoWidth || 1280)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const frames: string[] = [];
    for (let i = 1; i <= count; i++) {
      const t = (duration * i) / (count + 1);
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = Math.min(Math.max(0, t), Math.max(0, duration - 0.1));
      });
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL("image/jpeg", 0.72));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
